import { createSign } from "crypto";
import { applyScan, skanuara, type Product, type ScanResult } from "./list";

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || "1IR0CyGqtCaxxq1sADKztFgHdVw9O4zFkge-sr4CkaD4";
const PRODUCT_SHEET = "Sheet1";
const LOG_SHEET = "Skane";
const OPEN_SHEET = `https://opensheet.elk.sh/${SPREADSHEET_ID}/Sheet1`;

type LogEvent = { row: number; action: "scan" | "reset" };

let tokenCache: { value: string; exp: number } | null = null;

export function sheetsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

function privateKey(): string {
  return (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.value;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  signer.end();
  const assertion = `${header}.${claim}.${signer.sign(privateKey()).toString("base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error || "Google nuk e pranoi llogarinë e dokumentit.");
  }
  tokenCache = { value: body.access_token, exp: Date.now() + 50 * 60 * 1000 };
  return body.access_token;
}

async function sheetsFetch(path: string, init?: RequestInit) {
  const token = await accessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as { error?: { message?: string } } : {};
  if (!response.ok) throw new Error(body.error?.message || "Dokumenti nuk u lexua.");
  return body;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function cell(row: string[], index: number): string {
  return String(row[index] ?? "").trim();
}

function countsFromLog(events: LogEvent[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const event of events) {
    if (event.action === "reset") counts.set(event.row, 0);
    else counts.set(event.row, (counts.get(event.row) ?? 0) + 1);
  }
  return counts;
}

async function readLog(): Promise<LogEvent[]> {
  const body = await sheetsFetch(`/values/${encodeURIComponent(`${LOG_SHEET}!A2:C`)}`) as { values?: string[][] };
  return (body.values || []).flatMap((row) => {
    const sheetRow = Number(row[1]) || 0;
    if (!sheetRow) return [];
    const action: LogEvent["action"] = row[2] === "reset" ? "reset" : "scan";
    return [{ row: sheetRow, action }];
  });
}

async function ensureLogSheet() {
  const meta = await sheetsFetch("?fields=sheets.properties.title") as {
    sheets?: { properties?: { title?: string } }[];
  };
  const titles = (meta.sheets || []).map((sheet) => sheet.properties?.title);
  if (!titles.includes(LOG_SHEET)) {
    await sheetsFetch(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: LOG_SHEET } } }] }),
    });
  }
  await sheetsFetch(`/values/${encodeURIComponent(`${LOG_SHEET}!A1:C1`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [["Koha", "Rreshti", "Veprimi"]] }),
  });
}

async function appendEvent(row: number, action: "scan" | "reset") {
  const values = [[new Date().toISOString(), String(row), action]];
  try {
    await sheetsFetch(`/values/${encodeURIComponent(`${LOG_SHEET}!A:C`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values }),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (!/unable to parse range|skane/i.test(message)) throw cause;
    await ensureLogSheet();
    await sheetsFetch(`/values/${encodeURIComponent(`${LOG_SHEET}!A:C`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values }),
    });
  }
}

type ParsedSheet = {
  products: Product[];
  summaryRow: number | null;
  ratioColumn: number;
};

async function readSheet(counts: Map<number, number>): Promise<ParsedSheet> {
  const body = await sheetsFetch(`/values/${encodeURIComponent(`${PRODUCT_SHEET}!A:Z`)}`) as { values?: string[][] };
  const table = body.values || [];
  const header = (table[0] || []).map((item) => item.trim().toLowerCase());
  const indexOf = (...names: string[]) => header.findIndex((item) => names.includes(item));
  const columns = {
    order: indexOf("order id"),
    ref: indexOf("reference code"),
    ean: indexOf("barkod / ean", "barkod", "ean"),
    name: indexOf("emertimi"),
    qty: indexOf("sasia"),
  };
  let ratioColumn = indexOf("skanuara/sasia", "skanuar");
  if (ratioColumn < 0) ratioColumn = Math.max(header.length, 5);

  const products: Product[] = [];
  let summaryRow: number | null = null;
  table.slice(1).forEach((row, index) => {
    const sheetRow = index + 2;
    const refCode = columns.ref >= 0 ? cell(row, columns.ref) : "";
    const ean = columns.ean >= 0 ? cell(row, columns.ean) : "";
    const name = columns.name >= 0 ? cell(row, columns.name) : "";
    const quantity = Math.max(0, Math.round(Number(columns.qty >= 0 ? cell(row, columns.qty) : "0") || 0));
    if (!refCode && !ean) {
      if (name) summaryRow = sheetRow;
      return;
    }
    products.push({
      row: sheetRow,
      orderId: columns.order >= 0 ? cell(row, columns.order) : "",
      refCode,
      ean,
      name,
      quantity,
      scanned: counts.get(sheetRow) ?? 0,
    });
  });
  return { products, summaryRow, ratioColumn };
}

async function writeRatio(sheetRow: number, column: number, scanned: number, quantity: number) {
  const letter = columnLetter(column);
  await sheetsFetch(`/values/${encodeURIComponent(`${PRODUCT_SHEET}!${letter}1`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [["Skanuara/Sasia"]] }),
  });
  await sheetsFetch(`/values/${encodeURIComponent(`${PRODUCT_SHEET}!${letter}${sheetRow}`)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [[skanuara({ scanned, quantity })]] }),
  });
}

async function publishCounts(focusRow?: number) {
  const counts = countsFromLog(await readLog());
  const sheet = await readSheet(counts);
  const quantity = sheet.products.reduce((sum, product) => sum + product.quantity, 0);
  const scanned = sheet.products.reduce((sum, product) => sum + product.scanned, 0);
  if (focusRow) {
    const product = sheet.products.find((item) => item.row === focusRow);
    if (product) await writeRatio(product.row, sheet.ratioColumn, product.scanned, product.quantity);
  }
  if (sheet.summaryRow) await writeRatio(sheet.summaryRow, sheet.ratioColumn, scanned, quantity);
  return sheet.products;
}

async function loadPublicProducts(): Promise<Product[]> {
  const response = await fetch(OPEN_SHEET, { cache: "no-store" });
  if (!response.ok) throw new Error("Lista e produkteve nuk u ngarkua.");
  const rows = (await response.json()) as Record<string, string>[];
  return rows.flatMap((row, index) => {
    const refCode = String(row["Reference Code"] ?? "").trim();
    const ean = String(row["Barkod / EAN"] ?? "").trim();
    if (!refCode && !ean) return [];
    return [{
      row: index + 2,
      orderId: String(row["Order ID"] ?? "").trim(),
      refCode,
      ean,
      name: String(row.Emertimi ?? "").trim(),
      quantity: Math.max(0, Math.round(Number(row.Sasia) || 0)),
      scanned: 0,
    }];
  });
}

export async function loadSharedProducts(): Promise<{ shared: boolean; products: Product[] }> {
  if (!sheetsConfigured()) return { shared: false, products: await loadPublicProducts() };
  try {
    const counts = countsFromLog(await readLog());
    const sheet = await readSheet(counts);
    return { shared: true, products: sheet.products };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (/unable to parse range|skane/i.test(message)) {
      const sheet = await readSheet(new Map());
      return { shared: true, products: sheet.products };
    }
    return { shared: false, products: await loadPublicProducts() };
  }
}

export async function recordScan(rawCode: string): Promise<{ products: Product[]; result: ScanResult | null }> {
  const current = await loadSharedProducts();
  if (!current.shared) throw new Error("Dokumenti i përbashkët nuk është i lidhur.");
  const applied = applyScan(current.products, rawCode);
  if (!applied.result || (applied.result.kind !== "match" && applied.result.kind !== "over")) {
    return { products: current.products, result: applied.result };
  }
  const targetRow = applied.result.product.row;
  await appendEvent(targetRow, "scan");
  const products = await publishCounts(targetRow);
  const fresh = products.find((item) => item.row === targetRow) ?? applied.result.product;
  return {
    products,
    result: { kind: fresh.scanned > fresh.quantity ? "over" : "match", product: fresh },
  };
}

export async function recordReset(row: number): Promise<Product[]> {
  const current = await loadSharedProducts();
  if (!current.shared) throw new Error("Dokumenti i përbashkët nuk është i lidhur.");
  if (!current.products.some((product) => product.row === row)) throw new Error("Ky produkt nuk është në dokument.");
  await appendEvent(row, "reset");
  return publishCounts(row);
}

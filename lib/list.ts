import { parseScan } from "./codes";

const SHEET_URL = "https://opensheet.elk.sh/1IR0CyGqtCaxxq1sADKztFgHdVw9O4zFkge-sr4CkaD4/Sheet1";
const STORAGE_KEY = "inbound-skanuara-v1";

export type Product = {
  row: number;
  orderId: string;
  refCode: string;
  ean: string;
  name: string;
  quantity: number;
  scanned: number;
};

export type ScanResult =
  | { kind: "match" | "over"; product: Product }
  | { kind: "order"; code: string; products: Product[] }
  | { kind: "unknown"; code: string };

type SheetRow = {
  "Order ID"?: string;
  "Reference Code"?: string;
  "Barkod / EAN"?: string;
  Emertimi?: string;
  Sasia?: string | number;
};

export function skanuara(product: Pick<Product, "scanned" | "quantity">): string {
  return `${product.scanned}/${product.quantity}`;
}

function codesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function rowKey(product: Pick<Product, "row" | "refCode" | "ean">): string {
  return `${product.row}|${product.refCode}|${product.ean}`;
}

function readSaved(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCounts(products: Product[]) {
  const counts: Record<string, number> = {};
  for (const product of products) {
    if (product.scanned > 0) counts[rowKey(product)] = product.scanned;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
}

function isSummaryRow(row: SheetRow): boolean {
  const refCode = String(row["Reference Code"] ?? "").trim();
  const ean = String(row["Barkod / EAN"] ?? "").trim();
  return !refCode && !ean;
}

export async function loadProducts(): Promise<Product[]> {
  const response = await fetch(SHEET_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Lista e produkteve nuk u ngarkua.");
  const rows = (await response.json()) as SheetRow[];
  const saved = readSaved();
  return rows.filter((row) => !isSummaryRow(row)).map((row, index) => {
    const product: Product = {
      row: index + 2,
      orderId: String(row["Order ID"] ?? "").trim(),
      refCode: String(row["Reference Code"] ?? "").trim(),
      ean: String(row["Barkod / EAN"] ?? "").trim(),
      name: String(row.Emertimi ?? "").trim(),
      quantity: Math.max(0, Math.round(Number(row.Sasia) || 0)),
      scanned: 0,
    };
    product.scanned = saved[rowKey(product)] ?? 0;
    return product;
  });
}

function isReferenceScan(code: string): boolean {
  return /^\d{4}-[A-Za-z]{2}\d{4}$/.test(code);
}

function isOrderScan(code: string): boolean {
  return /^\d+-\d+$/.test(code);
}

export function isAcceptedScan(raw: string): boolean {
  const code = parseScan(raw).code;
  return isReferenceScan(code) || isOrderScan(code);
}

export function applyScan(products: Product[], rawCode: string): { products: Product[]; result: ScanResult | null } {
  const code = parseScan(rawCode).code;
  if (!isReferenceScan(code) && !isOrderScan(code)) return { products, result: null };

  if (isReferenceScan(code)) {
    const matches = products
      .map((product, index) => ({ product, index }))
      .filter((item) => codesMatch(item.product.refCode, code));
    if (matches.length === 0) return { products, result: { kind: "unknown", code } };
    const target = matches.find((item) => item.product.scanned < item.product.quantity) ?? matches[matches.length - 1];
    const next = products.map((product, index) =>
      index === target.index ? { ...product, scanned: product.scanned + 1 } : product,
    );
    const product = next[target.index];
    return {
      products: next,
      result: { kind: product.scanned > product.quantity ? "over" : "match", product },
    };
  }

  const orders = products.filter((product) => codesMatch(product.orderId, code));
  if (orders.length > 0) return { products, result: { kind: "order", code, products: orders } };

  return { products, result: { kind: "unknown", code } };
}

export function scannedPieces(products: Product[]): number {
  return products.reduce((sum, product) => sum + product.scanned, 0);
}

export function copyRows(products: Product[]) {
  const quantity = products.reduce((sum, product) => sum + product.quantity, 0);
  const scanned = scannedPieces(products);
  return [
    ...products.map((product) => ({
      "Order ID": product.orderId,
      "Reference Code": product.refCode,
      "Barkod / EAN": product.ean,
      Emertimi: product.name,
      Sasia: product.quantity,
      "Skanuara/Sasia": skanuara(product),
    })),
    {
      "Order ID": "",
      "Reference Code": "",
      "Barkod / EAN": "",
      Emertimi: "Total",
      Sasia: quantity,
      "Skanuara/Sasia": skanuara({ scanned, quantity }),
    },
  ];
}

export async function downloadCopy(products: Product[]) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(copyRows(products)), "Sheet1");
  XLSX.writeFile(book, "list-of-products-scan.xlsx");
}

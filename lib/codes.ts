export type ScannedIdentity = {
  code: string;
  ean: string;
  ref: string;
};

function clean(raw: string): string {
  return raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

function isGtinLength(value: string): boolean {
  return value.length === 8 || value.length === 12 || value.length === 13 || value.length === 14;
}

function asEan(digits: string): string {
  if (digits.length === 14 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

function looksLikeRef(value: string): boolean {
  return /^[a-z0-9][a-z0-9._/-]{2,39}$/i.test(value) && /[a-z]/i.test(value);
}

export function eanEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  const left = a.replace(/\D/g, "").replace(/^0+/, "");
  const right = b.replace(/\D/g, "").replace(/^0+/, "");
  return left.length >= 8 && left === right;
}

export function parseScan(raw: string): ScannedIdentity {
  const code = clean(raw);
  const stripped = code.replace(/^\][A-Za-z]\d/, "").trim();
  let ean = "";
  let ref = "";

  const parenEan = stripped.match(/\(01\)(\d{14})/);
  const parenRef = stripped.match(/\(240\)([^()\s]+)/);
  if (parenEan) ean = asEan(parenEan[1]);
  if (parenRef && looksLikeRef(parenRef[1])) ref = parenRef[1];

  if (!ean || !ref) {
    const compact = stripped.replace(/[\s()]/g, "");
    const gs1 = compact.match(/^01(\d{14})(?:240([A-Za-z0-9._/-]+))?/);
    if (gs1 && isGtinLength(gs1[1])) {
      if (!ean) ean = asEan(gs1[1]);
      if (!ref && gs1[2] && looksLikeRef(gs1[2])) ref = gs1[2];
    }
  }

  for (const token of stripped.split(/[\s|,;]+/)) {
    const bare = token.trim().replace(/^\(+|\)+$/g, "");
    if (!bare || bare === "01" || bare === "240") continue;
    if (!ean && /^\d+$/.test(bare) && isGtinLength(bare)) {
      ean = asEan(bare);
      continue;
    }
    if (!ref && looksLikeRef(bare)) ref = bare;
  }

  return { code, ean, ref };
}

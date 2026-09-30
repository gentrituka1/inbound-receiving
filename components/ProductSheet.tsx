"use client";

import { useState } from "react";
import { scannedPieces, skanuara, type Product } from "@/lib/list";

export function ProductSheet({
  products,
  downloading,
  onReset,
  onDownload,
}: {
  products: Product[];
  downloading: boolean;
  onReset: (row: number) => void;
  onDownload: () => void;
}) {
  const [onlyScanned, setOnlyScanned] = useState(true);
  const visible = onlyScanned ? products.filter((product) => product.scanned > 0) : products;
  const quantity = products.reduce((sum, product) => sum + product.quantity, 0);
  const scanned = scannedPieces(products);
  const touched = products.filter((product) => product.scanned > 0).length;
  const progress = quantity > 0 ? Math.min(100, Math.round((scanned / quantity) * 100)) : 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-5 shadow-[0_10px_30px_rgba(42,36,32,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-wide text-[var(--muted)] uppercase">Dokumenti</p>
            <p className="mono mt-1 text-4xl font-semibold tracking-tight text-[var(--ink)]">{skanuara({ scanned, quantity })}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{touched} produkte të prekura nga {products.length}</p>
          </div>
          <div className="min-w-36 flex-1 sm:max-w-xs">
            <div className="h-2 overflow-hidden rounded-full bg-[#f3ece4]">
              <div className="h-full rounded-full bg-[var(--green)]" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-right text-xs font-semibold text-[var(--muted)]">{progress}%</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-[#f3ece4] p-1">
          <button
            type="button"
            onClick={() => setOnlyScanned(true)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${onlyScanned ? "bg-[var(--paper)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}
          >
            Të skanuara
          </button>
          <button
            type="button"
            onClick={() => setOnlyScanned(false)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${onlyScanned ? "text-[var(--muted)]" : "bg-[var(--paper)] text-[var(--ink)] shadow-sm"}`}
          >
            I gjithë dokumenti
          </button>
        </div>
        {onlyScanned ? null : (
          <button
            type="button"
            disabled={downloading}
            onClick={onDownload}
            className="min-h-11 rounded-full bg-[var(--navy)] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {downloading ? "Po përgatitet kopja…" : "Shkarko dokumentin"}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--paper)] px-5 py-10 text-center text-[var(--muted)]">
          Ende nuk është skanuar asnjë produkt.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((product) => (
            <li key={product.row} className={`rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[0_8px_24px_rgba(42,36,32,0.04)] ${cardEdge(product)}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-semibold leading-tight">{product.name || "—"}</p>
                  {product.orderId ? <p className="mono mt-1 text-xs text-[var(--muted)]">{product.orderId}</p> : null}
                </div>
                <p className={`mono shrink-0 rounded-2xl px-3 py-2 text-lg font-semibold ${countTone(product)}`}>{skanuara(product)}</p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Reference</dt>
                  <dd className="mono mt-1 font-semibold break-all">{product.refCode || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Barkod / EAN</dt>
                  <dd className="mono mt-1 font-semibold break-all">{product.ean || "—"}</dd>
                </div>
              </dl>
              <button
                type="button"
                disabled={product.scanned === 0}
                onClick={() => onReset(product.row)}
                className="mt-4 min-h-10 rounded-full border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Rivendos
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function cardEdge(product: Product): string {
  if (product.scanned > product.quantity) return "border-l-4 border-l-[var(--orange)]";
  if (product.scanned > 0) return "border-l-4 border-l-[var(--green)]";
  return "";
}

function countTone(product: Product): string {
  if (product.scanned > product.quantity) return "bg-[var(--orange-bg)] text-[var(--orange)]";
  if (product.scanned > 0) return "bg-[var(--green-bg)] text-[var(--green)]";
  return "bg-[#f3ece4] text-[var(--muted)]";
}

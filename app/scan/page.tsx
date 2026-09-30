"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarcodeCamera } from "@/components/BarcodeCamera";
import { ProductSheet } from "@/components/ProductSheet";
import { applyScan, downloadCopy, isAcceptedScan, loadProducts, saveCounts, skanuara, type Product, type ScanResult } from "@/lib/list";

export default function ScanPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [code, setCode] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [showSheet, setShowSheet] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadProducts()
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Lista e produkteve nuk u ngarkua.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!result || result.kind === "unknown") return;
    const context = new AudioContext();
    void context.resume();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = result.kind === "over" ? 420 : 2730;
    oscillator.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    oscillator.start(now);
    oscillator.stop(now + 0.12);
    return () => void context.close();
  }, [result]);

  function scan(raw: string) {
    if (!products || !isAcceptedScan(raw)) return;
    const next = applyScan(products, raw);
    if (!next.result) return;
    setProducts(next.products);
    setResult(next.result);
    if (next.result.kind === "match" || next.result.kind === "over") saveCounts(next.products);
  }

  function resetProduct(row: number) {
    if (!products) return;
    const next = products.map((product) => (product.row === row ? { ...product, scanned: 0 } : product));
    setProducts(next);
    saveCounts(next);
    setResult((current) => {
      if (!current || current.kind === "unknown") return current;
      if (current.kind === "order") {
        return { ...current, products: current.products.map((product) => (product.row === row ? { ...product, scanned: 0 } : product)) };
      }
      return current.product.row === row ? null : current;
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="text-sm font-semibold text-[var(--navy)]">
            Kreu
          </Link>
          {products ? (
            <button
              type="button"
              onClick={() => setShowSheet((open) => !open)}
              className="min-h-11 rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 text-sm font-semibold text-[var(--ink)]"
            >
              {showSheet ? "Kthehu te skaneri" : "Shiko produktet e skanuara"}
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="rounded-2xl bg-[var(--red-bg)] px-4 py-3 text-sm text-[var(--red)]">{error}</p> : null}
      {!products && !error ? <p className="text-[var(--muted)]">Po ngarkohet lista e produkteve…</p> : null}

      {products && showSheet ? (
        <ProductSheet
          products={products}
          downloading={downloading}
          onReset={resetProduct}
          onDownload={() => {
            setDownloading(true);
            void downloadCopy(products).finally(() => setDownloading(false));
          }}
        />
      ) : null}

      {products && !showSheet ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <BarcodeCamera onScan={scan} status={scanStatus(result)} />
          <div className="lg:sticky lg:top-4">
            <ResultCard result={result} />
          </div>
          <form
            className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-4 shadow-[0_10px_30px_rgba(42,36,32,0.06)]"
            onSubmit={(event) => {
              event.preventDefault();
              const next = code;
              setCode("");
              if (next.trim()) scan(next);
            }}
          >
            <label htmlFor="manual-code" className="text-sm font-semibold text-[var(--navy)]">
              Shkruaj një kod
            </label>
            <input
              id="manual-code"
              value={code}
              autoComplete="off"
              placeholder="Order ID ose REF"
              onChange={(event) => setCode(event.target.value)}
              className="mono mt-3 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-4 text-xl outline-none sm:text-2xl"
            />
            <button type="submit" className="mt-3 min-h-12 w-full rounded-full bg-[var(--navy)] text-sm font-semibold text-white">
              Numëro këtë kod
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function scanStatus(result: ScanResult | null): "ok" | "bad" | "over" | null {
  if (!result) return null;
  if (result.kind === "unknown") return "bad";
  if (result.kind === "over") return "over";
  return "ok";
}

function ResultCard({ result }: { result: ScanResult | null }) {
  if (!result) {
    return (
      <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] px-5 py-8 shadow-[0_10px_30px_rgba(42,36,32,0.06)]">
        <p className="text-2xl font-semibold">Gati për skanim</p>
        <p className="mt-2 text-[var(--muted)]">Skano Order ID për të parë produktet, ose referencën për të numëruar.</p>
      </section>
    );
  }

  if (result.kind === "order") {
    const count = result.products.length;
    return (
      <section className="rounded-3xl bg-[var(--green-bg)] px-4 py-5 text-[var(--green)]">
        <div className="flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-wide uppercase">Porosia</p>
            <p className="mono mt-1 text-xl font-semibold break-all">{result.code}</p>
          </div>
          <p className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold">
            {count} {count === 1 ? "produkt" : "produkte"}
          </p>
        </div>
        <ol className="mt-4 flex flex-col gap-3">
          {result.products.map((product, index) => (
            <li key={product.row} className="rounded-2xl bg-white px-4 py-4 text-[var(--ink)]">
              <div className="flex items-start gap-3">
                <span className="mono flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--green-bg)] text-sm font-semibold text-[var(--green)]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col items-start gap-1 sm:flex-row sm:justify-between sm:gap-3">
                    <p className="text-lg font-semibold leading-tight">{product.name || "—"}</p>
                    <p className="mono shrink-0 text-sm font-semibold text-[var(--green)]">Sasia {product.quantity}</p>
                  </div>
                  <dl className="mt-3 grid gap-2">
                    <div>
                      <dt className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Reference Code</dt>
                      <dd className="mono text-base font-semibold break-all">{product.refCode || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Barkod / EAN</dt>
                      <dd className="mono text-base font-semibold break-all">{product.ean || "—"}</dd>
                    </div>
                  </dl>
                  <p className="mono mt-3 text-sm font-semibold text-[var(--green)]">Skanuara/Sasia {skanuara(product)}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (result.kind === "unknown") {
    return (
      <section className="rounded-3xl bg-[var(--red-bg)] px-5 py-8 text-[var(--red)]">
        <p className="text-sm font-semibold tracking-wide uppercase">Nuk është në listë</p>
        <p className="mono mt-2 text-3xl font-semibold break-all">{result.code}</p>
      </section>
    );
  }

  const tone = result.kind === "over" ? "bg-[var(--orange-bg)] text-[var(--orange)]" : "bg-[var(--green-bg)] text-[var(--green)]";
  return (
    <section className={`rounded-3xl px-5 py-8 ${tone}`}>
      <p className="text-sm font-semibold tracking-[0.16em] uppercase">{result.kind === "over" ? "Copë shtesë" : "U skanua"}</p>
      <p className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{result.product.name}</p>
      <div className="mt-6 grid gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide uppercase">REF</p>
          <p className="mono text-2xl font-semibold">{result.product.refCode}</p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide uppercase">EAN</p>
          <p className="mono text-2xl font-semibold">{result.product.ean}</p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide uppercase">Skanuara/Sasia</p>
          <p className="mono text-4xl font-semibold leading-none sm:text-5xl">{skanuara(result.product)}</p>
        </div>
      </div>
    </section>
  );
}

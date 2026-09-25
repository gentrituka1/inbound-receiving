import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-12 sm:px-6 sm:py-16">
      <p className="text-sm font-semibold tracking-[0.18em] text-[var(--muted)] uppercase">Logjistikë</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--ink)] sm:text-5xl">Skano dërgesën</h1>
      <p className="mt-4 text-lg leading-relaxed text-[var(--muted)]">
        Hap kamerën, skano barkodin e çdo produkti, dhe lista regjistron sa copë kanë hyrë.
      </p>
      <Link
        href="/scan"
        className="mt-10 flex min-h-16 items-center justify-center rounded-full bg-[var(--navy)] px-6 text-lg font-semibold text-white"
      >
        Hap skanerin
      </Link>
    </main>
  );
}

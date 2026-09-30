"use client";

import { useEffect, useRef, useState } from "react";
import { isAcceptedScan } from "@/lib/list";

type Detector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "qr_code",
  "itf",
  "codabar",
  "data_matrix",
];

export function BarcodeCamera({
  onScan,
  status,
}: {
  onScan: (code: string) => void;
  status: "ok" | "bad" | "over" | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const stopRef = useRef<(() => void) | null>(null);
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchReady, setTorchReady] = useState(false);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => () => stopRef.current?.(), []);

  function accept(raw: string) {
    const code = raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
    if (!isAcceptedScan(code)) return;
    const now = Date.now();
    const last = lastRef.current;
    if (last && last.code === code && now - last.at < 1400) {
      last.at = now;
      return;
    }
    lastRef.current = { code, at: now };
    setFlash(code);
    window.setTimeout(() => setFlash((current) => (current === code ? "" : current)), 500);
    if (navigator.vibrate) navigator.vibrate(40);
    onScanRef.current(code);
  }

  async function start() {
    setError("");
    setBusy(true);
    stopRef.current?.();
    stopRef.current = null;
    try {
      if (!window.isSecureContext) {
        throw new Error("Kamera kërkon një faqe të sigurt. Hape këtë faqe me HTTPS, ose në localhost.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Shfletuesi i këtij telefoni nuk e hap kamerën.");
      }
      const video = videoRef.current;
      if (!video) throw new Error("Pamja e kamerës nuk është gati.");

      const native = await startNative(video, accept);
      if (native) {
        stopRef.current = native.stop;
        setTorchReady(Boolean(native.switchTorch));
        setLive(true);
        return;
      }

      const fallback = await startZxing(video, accept);
      stopRef.current = fallback.stop;
      setTorchReady(Boolean(fallback.switchTorch));
      setLive(true);
    } catch (cause) {
      setLive(false);
      setError(cameraMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    stopRef.current?.();
    stopRef.current = null;
    setLive(false);
    setTorchOn(false);
    setTorchReady(false);
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }

  async function toggleTorch() {
    const track = streamTrack(videoRef.current);
    if (!track) return;
    const next = !torchOn;
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      await BrowserMultiFormatReader.mediaStreamSetTorch(track, next);
      setTorchOn(next);
    } catch {
      setTorchReady(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--paper)] shadow-[0_10px_30px_rgba(42,36,32,0.06)]">
      <div className="relative h-[46vh] min-h-64 max-h-[28rem] w-full sm:h-80">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className={`absolute inset-0 h-full w-full bg-black object-cover ${live ? "block" : "hidden"}`}
        />
        {live ? (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-[27%] bg-black/70" />
            <div className="absolute inset-x-0 bottom-0 h-[27%] bg-black/70" />
            <div className="absolute top-[27%] bottom-[27%] left-0 w-[8%] bg-black/70" />
            <div className="absolute top-[27%] right-0 bottom-[27%] w-[8%] bg-black/70" />
            <div
              className={`absolute top-[27%] right-[8%] bottom-[27%] left-[8%] rounded-2xl border-4 ${status === "ok" ? "border-[var(--green)]" : status === "bad" ? "border-[var(--red)]" : status === "over" ? "border-[var(--orange)]" : "border-white"
                }`}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#f7f2ec] px-6 text-center text-[var(--ink)]">
            <p className="text-xl font-semibold sm:text-2xl">Skano me kamerën e telefonit</p>
            <p className="max-w-sm text-sm text-[var(--muted)]">Skano vetëm Order ID ose kodin e referencës.</p>
          </div>
        )}
        {flash ? <p className="mono absolute inset-x-0 bottom-3 z-10 truncate px-4 text-center text-sm text-white">{flash}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2 bg-[var(--paper)] p-3">
        {live ? (
          <button type="button" className="min-h-12 flex-1 rounded-full bg-[var(--navy)] px-4 text-sm font-semibold text-white" onClick={stop}>
            Mbyll kamerën
          </button>
        ) : (
          <button type="button" className="min-h-12 flex-1 rounded-full bg-[var(--navy)] px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => void start()}>
            {busy ? "Po hapet kamera…" : "Hap kamerën"}
          </button>
        )}
        {live && torchReady ? (
          <button type="button" className="min-h-12 rounded-full border border-[var(--line)] px-4 text-sm font-semibold" onClick={() => void toggleTorch()}>
            {torchOn ? "Fik dritën" : "Drita"}
          </button>
        ) : null}
      </div>
      {error ? <p className="bg-[var(--red-bg)] px-4 py-3 text-sm text-[var(--red)]">{error}</p> : null}
    </div>
  );
}

function streamTrack(video: HTMLVideoElement | null): MediaStreamTrack | null {
  const stream = video?.srcObject;
  if (!(stream instanceof MediaStream)) return null;
  return stream.getVideoTracks()[0] ?? null;
}

function cameraMessage(cause: unknown): string {
  if (cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError")) {
    return "Leja e kamerës u bllokua. Lejo kamerën për këtë faqe, pastaj provo përsëri.";
  }
  if (cause instanceof DOMException && cause.name === "NotFoundError") {
    return "Nuk u gjet kamera në këtë telefon.";
  }
  return cause instanceof Error ? cause.message : "Kamera nuk u hap.";
}

async function startNative(
  video: HTMLVideoElement,
  accept: (code: string) => void,
): Promise<{ stop: () => void; switchTorch?: boolean } | null> {
  const DetectorCtor = (window as Window & { BarcodeDetector?: new (options?: { formats?: string[] }) => Detector }).BarcodeDetector;
  if (!DetectorCtor) return null;
  let detector: Detector;
  try {
    detector = new DetectorCtor({ formats: NATIVE_FORMATS });
  } catch {
    return null;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
  await video.play();
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const found = await detector.detect(video);
      const value = found.find((item) => item.rawValue)?.rawValue;
      if (value) accept(value);
    } catch {
      // A single frame can fail while the camera is still starting.
    }
    if (!stopped) window.setTimeout(() => void tick(), 140);
  };
  void tick();
  const track = stream.getVideoTracks()[0];
  const capabilities = track?.getCapabilities?.() as { torch?: boolean } | undefined;
  return {
    switchTorch: Boolean(capabilities?.torch),
    stop: () => {
      stopped = true;
      stream.getTracks().forEach((item) => item.stop());
      video.srcObject = null;
    },
  };
}

async function startZxing(video: HTMLVideoElement, accept: (code: string) => void) {
  const [{ BrowserMultiFormatReader, BarcodeFormat }, { DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
    BarcodeFormat.DATA_MATRIX,
  ]);
  const reader = new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 120,
    delayBetweenScanSuccess: 250,
  });
  const controls = await reader.decodeFromConstraints(
    {
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    },
    video,
    (result) => {
      if (result) accept(result.getText());
    },
  );
  return {
    switchTorch: Boolean(controls.switchTorch),
    stop: () => controls.stop(),
  };
}

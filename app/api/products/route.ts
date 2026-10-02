import { NextResponse } from "next/server";
import { loadSharedProducts } from "@/lib/sheet-backend";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadSharedProducts());
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Lista e produkteve nuk u ngarkua.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

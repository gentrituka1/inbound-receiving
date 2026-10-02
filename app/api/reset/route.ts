import { NextResponse } from "next/server";
import { recordReset } from "@/lib/sheet-backend";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { row?: number };
  try {
    const products = await recordReset(Number(body.row));
    return NextResponse.json({ products });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Rivendosja nuk u ruajt në dokument.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

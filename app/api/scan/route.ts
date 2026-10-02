import { NextResponse } from "next/server";
import { recordScan } from "@/lib/sheet-backend";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { code?: string };
  try {
    return NextResponse.json(await recordScan(body.code || ""));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Skanimi nuk u ruajt në dokument.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

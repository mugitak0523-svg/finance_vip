import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

function parseLimit(value: string | null) {
  const limit = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(limit) || limit <= 0) {
    return 20;
  }
  return Math.min(limit, 100);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseLimit(searchParams.get("limit"));

    const logs = await prisma.ingestLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit
    });

    return NextResponse.json({
      ok: true,
      data: logs
    });
  } catch (error) {
    console.error("[api/logs] error", error);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 }
    );
  }
}

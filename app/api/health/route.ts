import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    const totalLogs = await prisma.ingestLog.count();
    const lastLog = await prisma.ingestLog.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, level: true }
    });

    return NextResponse.json({
      ok: true,
      db: "ok",
      totalLogs,
      lastLog
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        db: "ng",
        error: "db_unreachable"
      },
      { status: 500 }
    );
  }
}

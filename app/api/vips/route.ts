import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const vips = await prisma.vip.findMany({
      orderBy: { createdAt: "asc" }
    });

    return NextResponse.json({ ok: true, data: vips });
  } catch (error) {
    console.error("[api/vips] error", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

type CreateVipBody = {
  name?: unknown;
  aliases?: unknown;
  org?: unknown;
  title?: unknown;
};

function normalizeAliases(input: unknown): string[] {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0);
  }

  return [];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateVipBody;
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
    }

    const aliases = normalizeAliases(body.aliases);
    const org = typeof body.org === "string" ? body.org.trim() || null : null;
    const title = typeof body.title === "string" ? body.title.trim() || null : null;

    const vip = await prisma.vip.create({
      data: {
        name,
        aliases,
        org,
        title,
        isActive: true
      }
    });

    return NextResponse.json({ ok: true, data: vip });
  } catch (error) {
    console.error("[api/vips] post error", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    }

    await prisma.vip.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/vips] delete error", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

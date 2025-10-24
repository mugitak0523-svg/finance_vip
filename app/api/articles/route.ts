import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type PersonMatch = {
  vipIds: string[];
  terms: string[];
  feedVipId?: string;
};

function deriveDisplaySource(article: { url: string; sourceName: string | null }) {
  const trimSource = (value: string | null | undefined) => value?.trim() ?? "";

  try {
    const parsed = new URL(article.url);
    const host = parsed.hostname.replace(/^www\./i, "");
    if (host === "news.google.com") {
      const redirected = parsed.searchParams.get("url");
      if (redirected) {
        try {
          const final = new URL(redirected);
          return final.hostname.replace(/^www\./i, "");
        } catch {
          // fallback to below
        }
      }
      return "Google News";
    }
    if (host) {
      return host;
    }
  } catch {
    // ignore
  }

  const fallback = trimSource(article.sourceName);
  if (!fallback) {
    return "Unknown";
  }

  const segments = fallback.split(/\s+-\s+/);
  const last = segments[segments.length - 1];
  return last?.trim() || fallback;
}

function parsePositiveInt(value: string | null, fallback: number, options?: { min?: number; max?: number }) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  const min = options?.min ?? 1;
  const max = options?.max ?? Number.POSITIVE_INFINITY;

  return Math.min(Math.max(parsed, min), max);
}

function toPersonMatch(value: Prisma.JsonValue | null): PersonMatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { vipIds: [], terms: [] };
  }

  const record = value as Record<string, unknown>;
  const idsRaw = record.vipIds;
  const termsRaw = record.terms;

  const vipIds = Array.isArray(idsRaw)
    ? idsRaw.filter((entry): entry is string => typeof entry === "string")
    : [];

  const terms = Array.isArray(termsRaw)
    ? termsRaw.filter((entry): entry is string => typeof entry === "string")
    : [];

  return {
    vipIds,
    terms,
    feedVipId: typeof record.feedVipId === "string" ? record.feedVipId : undefined
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const vipId = searchParams.get("vipId")?.trim() || undefined;
    const query = searchParams.get("q")?.trim() || undefined;

    const page = parsePositiveInt(searchParams.get("page"), 1, { min: 1 });
    const limit = parsePositiveInt(searchParams.get("limit"), 20, { min: 1, max: 100 });
    const skip = (page - 1) * limit;

    const where: Prisma.ArticleWhereInput = {};

    if (vipId) {
      where.personMatch = {
        path: ["vipIds"],
        array_contains: vipId
      };
    }

    if (query) {
      where.OR = [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } }
      ];
    }

    const [articles, total] = await prisma.$transaction([
      prisma.article.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          url: true,
          sourceName: true,
          publishedAt: true,
          createdAt: true,
          fetchedAt: true,
          status: true,
          personMatch: true
        }
      }),
      prisma.article.count({ where })
    ]);

    const matchedVipIds = new Set<string>();
    for (const article of articles) {
      const match = toPersonMatch(article.personMatch);
      for (const id of match.vipIds) {
        matchedVipIds.add(id);
      }
    }

    const vipList = matchedVipIds.size
      ? await prisma.vip.findMany({
          where: { id: { in: Array.from(matchedVipIds) } },
          select: { id: true, name: true, isActive: true }
        })
      : [];

    const vipMap = new Map(vipList.map((vip) => [vip.id, vip]));

    const items = articles.map((article) => {
      const match = toPersonMatch(article.personMatch);
      const vipMatches = match.vipIds
        .map((id) => {
          const vip = vipMap.get(id);
          if (!vip) {
            return undefined;
          }
          return { id: vip.id, name: vip.name, isActive: vip.isActive };
        })
        .filter((entry): entry is { id: string; name: string; isActive: boolean } => Boolean(entry));

      return {
        id: article.id,
        title: article.title,
        description: article.description,
        url: article.url,
        sourceName: article.sourceName,
        displaySource: deriveDisplaySource({ url: article.url, sourceName: article.sourceName }),
        publishedAt: article.publishedAt,
        createdAt: article.createdAt,
        fetchedAt: article.fetchedAt,
        status: article.status,
        vipMatches,
        matchTerms: match.terms
      };
    });

    const hasMore = skip + items.length < total;

    return NextResponse.json({
      ok: true,
      data: {
        items,
        page,
        pageSize: limit,
        total,
        hasMore
      }
    });
  } catch (error) {
    console.error("[api/articles] error", error);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 }
    );
  }
}

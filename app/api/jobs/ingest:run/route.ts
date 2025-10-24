import { NextRequest, NextResponse } from 'next/server';

import { runIngest } from '@/lib/ingest';

export const dynamic = 'force-dynamic';

type RequestBody = {
  vipIds?: unknown;
  recentHours?: unknown;
  dryRun?: unknown;
};

function normalizeVipIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const ids = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
  return ids.length > 0 ? ids : undefined;
}

function normalizeRecentHours(value: unknown): number | undefined {
  if (typeof value !== 'number') {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function normalizeDryRun(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }
    if (value.toLowerCase() === 'false') {
      return false;
    }
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key');
  const configuredKey = process.env.API_KEY;

  if (!configuredKey || adminKey !== configuredKey) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let payload: RequestBody = {};
  try {
    payload = (await req.json()) as RequestBody;
  } catch {
    payload = {};
  }

  const vipIds = normalizeVipIds(payload.vipIds);
  const recentHours = normalizeRecentHours(payload.recentHours);
  const dryRun = normalizeDryRun(payload.dryRun) ?? false;

  const result = await runIngest({
    vipIds,
    recentHours: recentHours ?? 24,
    dryRun,
    followHtmlCanonical: true
  });

  return NextResponse.json({ ok: true, ...result });
}

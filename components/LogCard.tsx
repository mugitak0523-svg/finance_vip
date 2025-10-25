import type { IngestLogEntry } from "@/lib/fetchers";

type Totals = {
  new: number;
  skip: number;
  error: number;
  seen: number;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "不明";
  }
  const formatted = date.toLocaleString("ja-JP", { hour12: false, timeZone: "Asia/Tokyo" });
  return `${formatted} JST`;
}

function calculateDuration(startedAt: string, endedAt: string) {
  const start = new Date(startedAt).valueOf();
  const end = new Date(endedAt).valueOf();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return "-";
  }
  const diffSec = Math.max(0, Math.round((end - start) / 1000));
  return `${diffSec}s`;
}

function extractTotals(stats: Record<string, unknown>): Totals {
  const totals = stats?.totals;
  if (!totals || typeof totals !== "object" || Array.isArray(totals)) {
    return { new: 0, skip: 0, error: 0, seen: 0 };
  }

  const record = totals as Record<string, unknown>;
  const get = (key: keyof Totals) => (typeof record[key] === "number" ? (record[key] as number) : 0);

  return {
    new: get("new"),
    skip: get("skip"),
    error: get("error"),
    seen: get("seen")
  };
}

export function LogCard({ log }: { log: IngestLogEntry }) {
  const totals = extractTotals(log.stats ?? {});

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-700">ジョブ: {log.jobId ?? "(不明)"}</div>
          <div className="text-xs text-slate-500">
            {formatDate(log.startedAt)} → {formatDate(log.endedAt)} / {calculateDuration(log.startedAt, log.endedAt)}
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {log.level}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700">
          <div className="text-xs">NEW</div>
          <div className="text-lg font-semibold">{totals.new}</div>
        </div>
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
          <div className="text-xs">SKIP</div>
          <div className="text-lg font-semibold">{totals.skip}</div>
        </div>
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
          <div className="text-xs">SEEN</div>
          <div className="text-lg font-semibold">{totals.seen}</div>
        </div>
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">
          <div className="text-xs">ERROR</div>
          <div className="text-lg font-semibold">{totals.error}</div>
        </div>
      </div>

      {log.message ? <p className="mt-3 text-xs text-slate-500">{log.message}</p> : null}
    </div>
  );
}

export default LogCard;

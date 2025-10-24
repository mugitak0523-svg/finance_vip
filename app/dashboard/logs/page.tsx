import LogCard from "@/components/LogCard";
import { fetchLogs } from "@/lib/fetchers";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  let logs: Awaited<ReturnType<typeof fetchLogs>> = [];
  let errorMessage: string | null = null;

  try {
    logs = await fetchLogs(20);
  } catch (error) {
    console.error("[dashboard/logs] fetch error", error);
    errorMessage = "ログの取得に失敗しました。";
  }

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
          {errorMessage}
        </div>
      ) : null}

      {!errorMessage && logs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          まだログがありません。
        </div>
      ) : null}

      <div className="space-y-4">
        {logs.map((log) => (
          <LogCard key={log.id} log={log} />
        ))}
      </div>
    </div>
  );
}

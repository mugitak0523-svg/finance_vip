"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

import { fetchVips } from "@/lib/fetchers";
import type { VipEntry } from "@/lib/fetchers";

export type VipListHandle = {
  refresh: () => void;
};

const VipList = forwardRef<VipListHandle>(function VipListComponent(_, ref) {
  const [vips, setVips] = useState<VipEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchVips();
      setVips(data);
    } catch (err) {
      console.error("[VipList] fetch error", err);
      setError("VIP一覧の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({ refresh: load }), []);

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    if (pending) {
      return;
    }

    setPending(true);
    setRemovingId(id);

    try {
      const res = await fetch(`/api/vips?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(`request_failed_${res.status}`);
      }
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error ?? "unknown_error");
      }
    } catch (err) {
      console.error("[VipList] delete error", err);
      setError("削除に失敗しました。");
    } finally {
      setRemovingId(null);
      setPending(false);
      await load();
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">登録済みVIP</h2>
      </div>
      <div className="divide-y divide-slate-200">
        {loading ? (
          <div className="p-4 text-sm text-slate-500">読み込み中...</div>
        ) : error ? (
          <div className="p-4 text-sm text-rose-600">{error}</div>
        ) : vips.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">VIPが登録されていません。</div>
        ) : (
          vips.map((vip) => (
            <div key={vip.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-800">{vip.name}</div>
                {vip.aliases.length > 0 ? (
                  <div className="text-xs text-slate-500">{vip.aliases.join(", ")}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => remove(vip.id)}
                disabled={pending && removingId === vip.id}
                className="self-start rounded-lg px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 md:self-auto"
              >
                {pending && removingId === vip.id ? "削除中..." : "削除"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

export default VipList;

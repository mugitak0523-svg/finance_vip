"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type FilterValues = {
  q?: string;
  vipId?: string;
  from?: string;
  to?: string;
};

type VipOption = {
  id: string;
  name: string;
};

type FiltersProps = {
  vips: VipOption[];
  initial: FilterValues;
};

export default function Filters({ vips, initial }: FiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [keyword, setKeyword] = useState(initial.q ?? "");
  const [vipId, setVipId] = useState(initial.vipId ?? "");
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");

  useEffect(() => {
    setKeyword(initial.q ?? "");
    setVipId(initial.vipId ?? "");
    setFrom(initial.from ?? "");
    setTo(initial.to ?? "");
  }, [initial.q, initial.vipId, initial.from, initial.to]);

  const applyFilters = (next: FilterValues) => {
    const params = new URLSearchParams(searchParams.toString());

    if (next.q && next.q.trim()) {
      params.set("q", next.q.trim());
    } else {
      params.delete("q");
    }

    if (next.vipId) {
      params.set("vipId", next.vipId);
    } else {
      params.delete("vipId");
    }

    if (next.from) {
      params.set("from", next.from);
    } else {
      params.delete("from");
    }

    if (next.to) {
      params.set("to", next.to);
    } else {
      params.delete("to");
    }

    params.delete("page");

    const queryString = params.toString();
    const href = queryString ? `${pathname}?${queryString}` : pathname;

    startTransition(() => {
      router.push(href as Parameters<typeof router.push>[0]);
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    applyFilters({ q: keyword, vipId, from, to });
  };

  const handleReset = () => {
    setKeyword("");
    setVipId("");
    setFrom("");
    setTo("");
    applyFilters({});
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm md:flex-row md:items-end">
      <div className="flex-1">
        <label className="block text-xs font-semibold text-slate-600">キーワード</label>
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="タイトル・概要を検索"
          className="mt-1 w-full rounded-lg border border-slate-300 p-2 focus:border-blue-500 focus:outline-none"
          disabled={isPending}
        />
      </div>
      <div className="flex-1">
        <label className="block text-xs font-semibold text-slate-600">VIP</label>
        <select
          value={vipId}
          onChange={(event) => setVipId(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 p-2 focus:border-blue-500 focus:outline-none"
          disabled={isPending}
        >
          <option value="">全て</option>
          {vips.map((vip) => (
            <option key={vip.id} value={vip.id}>
              {vip.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <label className="block text-xs font-semibold text-slate-600">開始日</label>
        <input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 p-2 focus:border-blue-500 focus:outline-none"
          disabled={isPending}
        />
      </div>
      <div className="flex-1">
        <label className="block text-xs font-semibold text-slate-600">終了日</label>
        <input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 p-2 focus:border-blue-500 focus:outline-none"
          disabled={isPending}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          {isPending ? "適用中..." : "適用"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={isPending}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
        >
          クリア
        </button>
      </div>
    </form>
  );
}

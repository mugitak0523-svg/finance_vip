"use client";

import { useState, useTransition } from "react";

import { triggerIngestAction } from "@/app/dashboard/articles/actions";

type Status = { variant: "success" | "error"; message: string } | null;

export default function IngestButton() {
  const [status, setStatus] = useState<Status>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    setStatus(null);
    startTransition(async () => {
      const response = await triggerIngestAction();
      if (response.ok) {
        const totals = response.result.totals;
        setStatus({
          variant: "success",
          message: `収集完了：新規${totals.new}件 (既存${totals.skip}件)`
        });
        return;
      }
      setStatus({ variant: "error", message: response.error ?? "収集に失敗しました" });
    });
  };

  return (
    <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {isPending ? "収集中..." : "新規記事収集"}
      </button>
      {status ? (
        <span
          className={`text-sm ${
            status.variant === "success" ? "text-emerald-700" : "text-rose-600"
          }`}
        >
          {status.message}
        </span>
      ) : null}
    </div>
  );
}

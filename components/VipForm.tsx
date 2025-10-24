"use client";

import { FormEvent, useState } from "react";

type VipFormProps = {
  onAdd?: () => void;
};

export default function VipForm({ onAdd }: VipFormProps) {
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim()) {
      setError("名前は必須です。");
      return;
    }

    if (submitting) {
      return;
    }

    setSubmitting(true);

    try {
      setError(null);

      const aliasArray = aliases
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

      const res = await fetch("/api/vips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), aliases: aliasArray })
      });

      if (!res.ok) {
        throw new Error(`request_failed_${res.status}`);
      }

      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error ?? "unknown_error");
      }

      setName("");
      setAliases("");
      onAdd?.();
    } catch (err) {
      console.error("[VipForm] add error", err);
      setError("追加に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 rounded-xl bg-slate-50 p-4 shadow-sm md:flex-row md:items-end"
      >
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-600">名前</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="名前"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 focus:border-blue-500 focus:outline-none"
            disabled={submitting}
          />
        </div>
        <div className="flex-1 md:flex-[1.5]">
          <label className="block text-xs font-semibold text-slate-600">別名（カンマ区切り）</label>
          <input
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            placeholder="別名"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 focus:border-blue-500 focus:outline-none"
            disabled={submitting}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 md:w-auto"
        >
          {submitting ? "追加中..." : "追加"}
        </button>
      </form>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

"use server";

import { revalidatePath } from "next/cache";

import { runIngest } from "@/lib/ingest";
import type { IngestResult } from "@/lib/ingest";

type TriggerIngestResponse =
  | { ok: true; result: IngestResult }
  | { ok: false; error: string };

export async function triggerIngestAction(): Promise<TriggerIngestResponse> {
  try {
    const result = await runIngest({
      recentHours: 24,
      followHtmlCanonical: true
    });

    revalidatePath("/dashboard/articles");
    revalidatePath("/dashboard/logs");

    return { ok: true, result };
  } catch (error) {
    console.error("[triggerIngestAction] failed", error);
    return { ok: false, error: "収集に失敗しました。もう一度お試しください。" };
  }
}

import Link from "next/link";

export const dynamic = "force-dynamic";

export default function Home() {
  
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">Finance VIP News ダッシュボード</h1>
      <p className="text-slate-600">
        収集した記事・ジョブログ・VIPリストを確認できる管理UIです。最新の健康状態は
        <code className="mx-1 rounded bg-slate-100 px-2 py-1">/api/health</code> から確認できます。
      </p>
      <Link
        href={{ pathname: "/dashboard" }}
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700"
      >
        ダッシュボードへ
      </Link>
    </main>
  );
}

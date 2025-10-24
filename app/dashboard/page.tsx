import Link from "next/link";

export const dynamic = "force-dynamic";

const sections: Array<{ href: string; title: string; description: string }> = [
  { href: "/dashboard/articles", title: "記事一覧", description: "VIPに紐づく最新記事を検索・フィルタ" },
  { href: "/dashboard/logs", title: "収集ログ", description: "定期ジョブの実行履歴と統計を確認" },
  { href: "/dashboard/vips", title: "VIP管理", description: "監視対象VIPの追加・削除" }
];

export default function DashboardPage() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {sections.map((section) => (
        <Link
          key={section.href}
          href={{ pathname: section.href }}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-400 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{section.description}</p>
        </Link>
      ))}
    </div>
  );
}

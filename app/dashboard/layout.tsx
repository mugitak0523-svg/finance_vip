import Link from "next/link";
import { ReactNode } from "react";

const links: Array<{ href: string; label: string }> = [
  { href: "/dashboard/articles", label: "記事一覧" },
  { href: "/dashboard/logs", label: "収集ログ" },
  { href: "/dashboard/vips", label: "VIP管理" }
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Finance VIP Dashboard</h1>
          <p className="text-sm text-slate-500">記事・ログ・VIPを管理するシンプルな UI</p>
        </div>
        <nav className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={{ pathname: link.href }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-400 hover:text-blue-700"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="space-y-6">{children}</main>
    </div>
  );
}

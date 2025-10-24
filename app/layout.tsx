import "@/styles/globals.css";

import { ReactNode } from "react";

export const metadata = {
  title: "Finance VIP News",
  description: "Phase 1 foundation for finance VIP news collector"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-100 text-gray-800">{children}</body>
    </html>
  );
}

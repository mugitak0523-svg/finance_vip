import { ReactNode } from "react";

export const metadata = {
  title: "Finance VIP News",
  description: "Phase 1 foundation for finance VIP news collector"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

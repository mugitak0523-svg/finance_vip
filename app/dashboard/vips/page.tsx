import VipManager from "@/components/VipManager";

export const dynamic = "force-dynamic";

export default function VipsPage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        新しいVIPの追加や削除が即時に反映されます。別名はカンマ区切りで入力してください。
      </p>
      <VipManager />
    </div>
  );
}

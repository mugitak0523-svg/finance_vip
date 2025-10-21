# Phase 5 超詳細設計書（Railway Cron統合・スケジュール自動化・運用安定化）

> 前提：Phase 1〜4 で **収集パイプラインの手動実行** が動作していること。  
> 目的：Phase 4 までで完成した `runIngest()` を **自動で定期実行**し、運用負荷を下げる。  
> 本フェーズでは Railway の **Cron機能** を活用し、VIPごとのジョブを分割・並列化して、API経由またはCLIスクリプトを定期起動する。  
> 監視は `IngestLog` および Railway のログを利用し、Slack通知等の外部通知は使用しない。

---

## 0. スコープ / 非スコープ

**含む（今回の成果）**
- Railway Cron設定と構成設計
- スケジュールジョブ：`/api/jobs/ingest:run` の自動起動（VIP分割ロジック含む）
- 分割・輪番戦略：VIPを複数グループに分け、同時実行上限を制御
- 監視・エラー対応：IngestLog と Railway ログを活用

**含まない**
- Slack・メール通知などの外部連携
- UI 可視化ダッシュボード（Phase 6）
- AI解析・記事要約処理（Phase 7〜）

---

## 1. Railway Cron 概要

Railway の Cron は **Commandベースの定期実行機能**。  
アプリケーションの `scripts/` に配置したスクリプトを、環境変数付きで毎時・毎日などの頻度で起動できる。

**設定画面例**
- Command:  
  ```bash
  npx tsx scripts/ingest-once.ts --group=0
  ```
- Schedule: `0 * * * *` （毎時0分）
- Variables:  
  - `API_KEY`（Phase4で設定済み）
  - `GROUP_INDEX=0`（ジョブ分割インデックス）
  - `GROUP_COUNT=4`（全体VIPを4分割）

---

## 2. VIP分割ロジック設計

VIPを複数グループに分け、1ジョブあたりのAPI負荷を軽減する。

### 実装方針
- 全VIPを `GROUP_COUNT` で割り、インデックスを `GROUP_INDEX` で指定。  
- 実行時に該当グループのみ収集。

```ts
async function getVipGroup(index: number, count: number) {
  const all = await prisma.vip.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const group = all.filter((_, i) => i % count === index);
  return group;
}
```

CLIまたはAPI呼び出し時に `groupIndex` を指定し、次のように利用：

```ts
const vips = await getVipGroup(Number(process.env.GROUP_INDEX ?? 0), Number(process.env.GROUP_COUNT ?? 4));
await runIngest({ vipIds: vips.map(v => v.id), recentHours: 24 });
```

---

## 3. 自動ジョブ構成（Railway設定例）

| ジョブ名 | GROUP_INDEX | スケジュール | 想定対象VIP数 | 備考 |
|----------|--------------|--------------|----------------|------|
| ingest-0 | 0 | 毎時0分 | 約25% |  |
| ingest-1 | 1 | 毎時15分 | 約25% |  |
| ingest-2 | 2 | 毎時30分 | 約25% |  |
| ingest-3 | 3 | 毎時45分 | 約25% |  |

> - 各ジョブは同じ `.env` を共有する（DB・API_KEY共通）  
> - 並列化により、全VIPを1時間でカバー可能（4分割時）

---

## 4. CLIスクリプト修正

`scripts/ingest-once.ts` を以下のように拡張：

```ts
#!/usr/bin/env tsx
import "dotenv/config";
import { runIngest } from "@/lib/ingest";
import { prisma } from "@/lib/db";

async function main() {
  const index = Number(process.env.GROUP_INDEX ?? 0);
  const count = Number(process.env.GROUP_COUNT ?? 4);
  const vips = await prisma.vip.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const targets = vips.filter((_, i) => i % count === index);

  console.log(`[Ingest] Group ${index}/${count} - ${targets.length} VIPs`);
  const res = await runIngest({ vipIds: targets.map(v => v.id), recentHours: 24, followHtmlCanonical: true });
  console.log(JSON.stringify(res, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

---

## 5. エラー・再試行戦略

### 5.1 通信エラー（RSS/resolveCanonical）
- `fetch` は 2 回まで指数バックオフで再試行（Phase3設計）。
- タイムアウト時は `error++` としてログ記録。

### 5.2 DB競合（UNIQUE urlNorm）
- Prismaが `P2002` を返す → `skip++` カウントに変換。  
- IngestLog に反映。

### 5.3 ジョブ全体エラー
- `process.exit(1)` 時に Railway で自動再試行（最大3回）。
- 再試行後も失敗した場合は、手動で再実行可能。

---

## 6. 運用・監視

### 6.1 ログ確認
- Railway の「Deploy Logs」または `IngestLog` テーブルで実行履歴確認。  
- 例：
  ```sql
  SELECT jobId, startedAt, endedAt, (stats->'totals') as totals FROM "IngestLog" ORDER BY createdAt DESC LIMIT 10;
  ```

### 6.2 手動再実行
```bash
# 特定VIPのみ再収集
npx tsx scripts/ingest-once.ts --group=2
# または API 経由
curl -X POST https://app/api/jobs/ingest:run -H "X-Admin-Key: $API_KEY" -d '{"vipIds":["vip123"]}'
```

### 6.3 フェイルセーフ
- エラーが多いジョブは次のCron周期で自動再試行。  
- `IngestLog` の `stats.error` が多いVIPを特定して手動収集可。

---

## 7. 開発・テスト計画

### 7.1 ローカル検証
```bash
GROUP_INDEX=0 GROUP_COUNT=4 npx tsx scripts/ingest-once.ts
```

- Prisma DB が正常接続できることを確認。  
- `IngestLog` に記録が残る。

### 7.2 E2Eテスト（擬似Cron）
- Jest + mock process.env
- `GROUP_INDEX` を 0〜3 に変化させ、`runIngest()` が正しくVIPを分割するか確認。

```ts
test("group partitioning divides VIPs evenly", async () => {
  const vips = Array.from({ length: 8 }, (_, i) => ({ id: `v${i}`, name: `VIP${i}`, isActive: true }));
  const groups = [0,1,2,3].map(i => vips.filter((_, j) => j % 4 === i));
  expect(groups.flat().length).toBe(8);
});
```

---

## 8. DoD / AC（完了基準）

**DoD**
- Railway Cron にて ingest ジョブが **毎時自動実行**され、`IngestLog` に結果が蓄積。
- すべてのVIPが1時間以内に巡回処理される。
- 再試行（exit code 1）で自動復旧が機能。

**AC**
- Cronが定期実行後もアプリ応答が正常（API負荷過多なし）
- `IngestLog` が毎時間更新される。
- 失敗ジョブは次周期で再試行され、手動再実行でも回復可能。

---

## 9. 今後のPhase 6との接続

- Phase 6では `IngestLog` と `Article` を**ダッシュボード表示**する。  
- 本フェーズで蓄積されるログは、UI集計にそのまま使用可能（グラフ／統計／履歴）。

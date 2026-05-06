- ユーザーへの通知や Pull Request、Issue、コメントは日本語を使用してください。

## リポジトリ概要

- このリポジトリは npm workspaces 構成です。ルートの `package.json` には有効な build/lint スクリプトがないため、基本的に `npm run <script> -w back|webapp|cdk` で各 workspace を操作します。
- ワークスペースは次の 3 つです。
  - `back`: Lambda 向けの API / バッチ / 共通ユーティリティ
  - `webapp`: Vue 3 + Vite の SPA
  - `cdk`: AWS CDK スタック

## Build / Test / Lint コマンド

### セットアップ

```bash
npm ci
```

### Backend (`back`)

```bash
npm run lint -w back
npm run build -w back
npm run test -w back
npm run test -w back -- util/test/dataRange.test.ts
```

### Webapp (`webapp`)

```bash
npm run lint -w webapp
npm run build -w webapp
npm run test -w webapp
npm run test -w webapp -- test/dummy.test.ts
```

### CDK (`cdk`)

```bash
npm run lint -w cdk
npm run build -w cdk
npm run test -w cdk
npm run synth -w cdk
npm run deploy -w cdk
cd cdk && npx jest --runTestsByPath test/cdk.test.ts
```

### 実行上の注意

- `npm run lint -w cdk` は生成済みの `cdk/cdk.out` 配下まで ESLint 対象に含めてしまうため、`cdk synth` や `cdk deploy` の後は結果が汚れやすいです。
- `npm run test -w cdk` も `cdk.out` 内の生成物を拾いやすく、さらに `cdk/tsconfig.json` が `test` を除外しているため、Jest の実行は現状そのままだと壊れています。
- CI では main 向けの CI/CD が Node 20、PR Validation が Node 22 を使います。Lambda ランタイムは CDK 側で Node 20 です。

## 高レベルアーキテクチャ

- `cdk/lib/cdk-stack.ts` がインフラ全体を定義します。CloudFront が SPA 配信用 S3 と `/api/*` 用 API Gateway を束ね、EventBridge が日次バッチ Lambda を起動します。
- `back/batch/src/batchHandler.ts` は日次収集バッチです。Zenn の非公式 API (`https://zenn.dev/api/articles`) を 1 秒間隔でたどり、対象期間の記事を収集して S3 に `YYYY/MM/YYYYMMDD.json` 形式で保存し、そのデータから日次ランキングを DynamoDB に保存します。
- `back/api/src/handler.ts` はランキング取得 API です。`count` / `order` / `unit` / `range` を検証し、DynamoDB から `{ key, articles[] }` の配列を組み立てて返します。
- `webapp/src/feature/trends.ts` が API クライアント、`webapp/src/views/RankingView.vue` が画面の結線、`webapp/src/components/ranking/RankingChart.vue` と `RankingList.vue` がグラフ・一覧表示を担当します。ルーターは使っておらず、`App.vue` のタブ切り替えで `Ranking` と `About` を表示しています。

## 設計資料と実装の差分

- `doc/spec.md` と `doc/architecture.md` には daily / weekly / monthly 集計の構想がありますが、現在の実装経路は実質 daily 中心です。
- `webapp/src/views/RankingView.vue` は `unit = "day"` と `range = 7` を固定で使っており、過去の time-unit selector は撤去済みです。
- `cdk/lib/cdk-stack.ts` で作成して環境変数として渡しているのは `DAILY_TABLE_NAME` だけです。`back/api/src/handler.ts` には weekly / monthly の読み出し分岐がありますが、対応テーブルは CDK で作成されていません。
- そのため、集計単位を増やす変更は frontend / API / batch / CDK / `doc/*.md` をまとめて更新する前提で考えてください。

## このコードベース特有の約束事

- バックエンドとバッチは `dayjs.tz.setDefault("Asia/Tokyo")` を前提に日付計算しています。日付キー、前週計算、EventBridge の運用時刻は JST 前提です。
- バッチは Zenn API の snake_case をそのまま保持して収集し、DynamoDB に保存する直前に camelCase へ変換します。フロントエンドは `likedCount` / `commentsCount` / `avatarSmallUrl` を前提にしているので、API 返却形を崩さないでください。
- `webapp/src/feature/trends.ts` の API 呼び出し先は環境変数ではなく CloudFront ドメインのハードコードです。配信ドメインや API の公開経路を変えるときはこのファイルも更新が必要です。
- CDK は `../webapp/dist` を `BucketDeployment` で配信するため、`npm run synth -w cdk` や `npm run deploy -w cdk` の前に `npm run build -w webapp` が必要になるケースがあります。PR Validation でも CDK synth 前に webapp build を挟んでいます。
- PR Validation では `npm run test -w webapp || true` になっており、現状 webapp テストは必須ゲートではありません。frontend の変更では CI の通過条件だけで品質担保済みと見なさないでください。

## テスト規約

- `back` と `webapp` は Vitest を使用し、`**/test/**/*.{test,spec}.?(c|m)[jt]s?(x)` が対象です。`describe` / `it` は global で使えます。
- テストファイルは `test` ディレクトリ配下に置きます。既存例:
  - `back/api/test/handler.test.ts`
  - `back/batch/test/batchHandler.test.ts`
  - `back/util/test/dataRange.test.ts`
  - `webapp/test/dummy.test.ts`
  - `cdk/test/cdk.test.ts`
- AWS SDK のモックは `aws-sdk-client-mock` を使う実装が既にあります。外部モジュール全体の差し替えは `vi.mock`、個別関数やグローバルの差し替えは `vi.spyOn()` を優先します。
- バックエンド系テストでは境界値・異常値・ `null` / `undefined` を広めに押さえる傾向があります。似たパターンは `it.each` でまとめます。

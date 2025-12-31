---
name: aws-research
description: AWSに関する調査（仕様確認、設計判断、ベストプラクティス確認、料金/制限の概算前提整理、エラー原因調査、リージョン提供状況確認、CDK/CloudFormation/CLI/SDKの参照）を行うときに使う。調査では必ず公式ドキュメントを一次情報として扱い、aws-knowledge-mcp-server（https://knowledge-mcp.global.api.aws）を用いて検索・読解・関連ページ探索・リージョン可用性確認を行う。
---

# AWS Research

## MCP（必須）

調査では、次の MCP サーバーを利用する（一次情報を AWS 公式ドキュメントに寄せるため）。

```json
{
  "aws-knowledge-mcp-server": {
    "type": "http",
    "url": "https://knowledge-mcp.global.api.aws"
  }
}
```

## 調査の基本方針

- 公式ドキュメントを優先し、推測は推測として明示する
- 日付・バージョン・リージョン前提を先に確定する（不明なら質問する）

## クイック手順（推奨フロー）

1. 調査対象を具体化する

   - 対象サービス、やりたいこと、環境（リージョン、アカウント種別、VPC 有無、IaC の種類）を整理する
   - 「いつ時点の情報が必要か」を確認する（最新/特定日）

2. ドキュメント検索を行う

   - まずは `mcp_aws-knowledge_aws___search_documentation` を使って該当ページ候補を集める
   - 内容に応じて `topics` を選ぶ（最大 3 つ）
     - 実装/CLI/SDK/API: `reference_documentation`
     - 新機能/提供開始/最近の変更: `current_awareness`
     - エラー/不具合: `troubleshooting`
     - CDK: `cdk_docs` / `cdk_constructs`
     - CloudFormation: `cloudformation`
     - アーキ/設計/ベストプラクティス: `general`

3. 一次情報を読み込む

   - 候補ページを `mcp_aws-knowledge_aws___read_documentation` で読み、要点を抽出する
   - 長文で途切れた場合は `start_index` を進めて続きを取得する

4. 関連ページを探索する

   - 必要に応じて `mcp_aws-knowledge_aws___recommend` を使い、類似/新規/次に読まれるページを辿る

5. リージョン提供状況を確認する（必要時）

   - リージョン一覧: `mcp_aws-knowledge_aws___list_regions`
   - サービス/機能/API/CloudFormation リソースの提供状況: `mcp_aws-knowledge_aws___get_regional_availability`
   - 出力の `isAvailableIn` / `isNotAvailableIn` / `isPlannedIn` 等を明記して結論に反映する

6. まとめを作成する
   - 結論（推奨/非推奨/可否/対応案）を先に書く
   - 根拠として参照した AWS 公式ページの URL を列挙する
   - 不明点/前提/リスク（例：リージョン差、クォータ、料金、サポートプラン影響）を分離して記載する

## 出力テンプレート（推奨）

- **結論**:
- **前提**: （リージョン、時点、利用サービス、制約）
- **根拠（AWS 公式 URL）**:
- **手順/設定例**:
- **注意点**:
- **未確定事項（要確認）**:

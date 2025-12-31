- ユーザーへの通知や Pull Request、Issue、コメントは日本語を使用してください

### 技術スタック

- Node.js
- TypeScript
- Vitest
- AWS SDK for JavaScript v3
- AWS CDK

### テスト

- test ディレクトリ以下に`テスト対象ファイル名.test.js`という形式でテストファイルを作成する
- vitest を使用してテストを実装する
- テストは、`describe` と `it` を使用して構造化する
  - `describe` や `it`は global スコープで参照可能なため新たに import しない
- AWS SDK や外部サービスのモックについて
  - モジュール全体のモックが必要なら`vi.mock` を使用する
  - グローバルオブジェクトや関数のみのモックが必要なら、`vi.spyOn()` を使用する
- パラメータは境界値や異常値を含めて網羅的にテストする
- null や undefined の値もテストする
- 型が明示的に指定されていれば実行時の型の安全性のチェックは行わない
- テストパラメータと期待値の確認パターンが似ている場合は、`it.each` を使用してパラメータ化テストを行う
- テストの実行は、以下のコマンドで実行する

```bash
npx vitest run
```

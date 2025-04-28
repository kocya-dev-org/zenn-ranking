# アーキテクチャ

## 技術スタック

- フロントエンド
  - Vue3.js: フレームワーク
  - Element-plus: UI コンポーネント
  - echarts: グラフライブラリ
  - TypeScript
  - vite
  - vitest: 単体テスト
- バックエンド
  - Node.js
  - TypeScript
  - vitest: 単体テスト
  - AWS SDK for JavaScript v3
  - AWS SDK v3 Client mock
- データベース
  - DynamoDB
- CICD
  - AWS CDK v2
  - GitHub Actions

## 外部リソース

非公式の Zenn API を利用する。
呼び出し回数制限があるため、1 秒に 1 リクエストまでの制限があるため
記事集計の際は呼び出し間隔を空ける必要がある。

## 構成

### 概要

```
CloudFront
├── API Gateway
│ └── Lambda
│ └── DynamoDB
└── S3
EventBridge
└── Lambda
```

### リソース詳細

- CloudFront
  - CDN として Web アプリを配信する
  - S3 からの静的ファイルをキャッシュする
  - `{domain}/api/*`に対するリクエストを API Gateway にリクエストする
  - API 以外のリクエストを S3 にリクエストする
- API Gateway
  - API のリクエストを元に Lambda を起動する
  - CORS 無効
- S3
  - Web アプリとして SPA を配置する
  - 日単位の記事情報を格納する
- Lambda
  - API Gateway へのリクエストを元にバックエンドのロジック動作を担う
  - キャッシュの有効期限は 1 日
  - メモリ割り当て: 1024MB (仮)
  - ランタイム: Node.js 20.x
  - タイムアウト: 15 分
- DynamoDB
  - 記事の集計データを格納する
  - TTL なし
  - オンデマンド方式
- EventBridge
  - 定期的に Lambda を起動し、記事の集計データを生成、格納する
  - 日本時間の 01:00 に 1 回起動する (cron = `0 0 16 * * ?` ※UTC 指定)

### アクセス量試算

#### CloudFront

アクセス毎。
キャッシュ有効、かつ期間が 1 日。
その際の s3 アクセスは 1 回/day。

#### API Gateway

キャッシュ有効、かつ期間が 1 日。
そのため日/週/月単位指定それぞれの呼び出しがあるとして、 1 日に 3 回リクエストが発行される見込み。

#### Lambda

- API
  - API Gateway の項目を元に、3 回/day、処理時間は 1s 未満。
- 収集・分析処理
  - EventBridge 経由での呼び出し 1 回/day、処理時間は 30s 未満。

#### DynamoDB

- API
  - API Gateway の項目を元に、合計 get x 23 / day
    - 日単位: get x 7
    - 週単位: get x 4
    - 月単位: get x 12
- 分析処理 合計 get x 40, put x 3 / day
  - 日単位: put x 1 + get x max 7 + get x max 31
  - 週単位: get x 1, put x 1
  - 月単位: get x 1, put x 1

#### S3

- 収集処理
  - 日単位記事情報: put x 1 / day
- 分析処理
  - 日単位: get x 1 / day

## 機能

| カテゴリ   | 機能     | 説明                                                                 |
| ---------- | -------- | -------------------------------------------------------------------- |
| API        | 記事取得 | 日、週、月ごとの記事の集計データを DynamoDB の分析データから取得する |
| バッチ処理 | 記事集計 | 定期的に記事の集計データを Zenn API より生成、格納する               |

### API

記事ランキング情報の取得機能を提供する。
日、週、月ごとの記事の集計データを DynamoDB の分析データから取得する

### ランキング取得

#### Request

- Endpoint
  - https://{domain}/api/ranking
- QueryParameter
  - count : ランキング上位いくつかを示す数。10 件固定。
  - order : 並び替え順。 "liked" (いいね) 降順のみサポート。
  - unit : 集計単位。"daily" (日)、"weekly" (週)、"monthly" (月) のいずれか。
  - range: 集計範囲。集計単位の数を示す。(ex: daily で 7 を指定 →1 週間の集計データを取得する)
- StatusCode
  - 200: OK
  - 400: 不正なクエリパラメータ
  - 500: Zenn API の呼び出しに失敗, DynamoDB の格納に失敗, S3 の格納に失敗

#### Response

日の場合の例。
data に集計単位データが集計範囲分だけ配列として格納される。
集計単位データはその単位の日付キーとランキング情報の配列で示される。
data は実際には集計範囲分のデータが格納される。
articles は実際には表示ランキング上位数に応じたデータが格納される。

```json
{
  "data": [
    {
      "key": "2024-02-26",
      "articles": [
        {
          "id": 243899,
          "title": "AI でテキストを関西弁に翻訳する「kansAI」の紹介 with Gemini",
          "commentsCount": 0,
          "likedCount": 30,
          "articleType": "tech",
          "publishedAt": "2024-02-26T18:00:00.378+09:00",
          "user": {
            "id": 19167,
            "userName": "kou_pg_0131",
            "name": "koki",
            "avatarSmallUrl": "https://lh3.googleusercontent.com/a-/AOh14Ghb4YGzhOmUME8kf5ygMCjAh9k1xKBO4KugU0LCAg=s96-c"
          }
        }
      ]
    },
    {
      "key": "2024-02-27",
      "articles": [
        {
          "id": 154465,
          "title": "cat コマンド代替の Go 製 CLI 「gat」の紹介",
          "commentsCount": 9,
          "likedCount": 89,
          "articleType": "tech",
          "publishedAt": "2023-03-20T19:10:50.194+09:00",
          "user": {
            "id": 19167,
            "userName": "kou_pg_0131",
            "name": "koki",
            "avatarSmallUrl": "https://lh3.googleusercontent.com/a-/AOh14Ghb4YGzhOmUME8kf5ygMCjAh9k1xKBO4KugU0LCAg=s96-c"
          }
        }
      ]
    }
  ]
}
```

### バッチ処理

定期的に記事の集計データを生成、格納する。
EventBridge によって毎日 01:00 に Lambda を起動し下記処理を順次行う。

1. Zenn API より記事情報を収集し、s3 に日単位記事情報を格納する。
2. 日単位記事情報を元に、分析データ(日単位)を算出、DynamoDB に格納する。
3. 分析データ(日単位)を元に、週単位、月単位の分析データを生成し、DynamoDB に格納する。

## データ

### 日単位記事情報

記事情報の最小単位。その日のデータのうち、いいね数 0 件を除いた記事情報。
Zenn API で収集したデータを json 形式のテキストファイルとして S3 上に配置する。

### 分析データ(日単位)

日単位の上位 10 記事のランキングをまとめたもの。
S3 上の日単位記事情報を元に、「いいね」数の上位 10 名をまとめて DynamoDB に格納する。

### 分析データ(週単位)

DynamoDB 上の分析データ(日単位)を週ごとにまとめたもの。月曜日～日曜日までを 1 つの週単位とする。
集計結果をまとめて上位 10 名をまとめて DynamoDB に格納する。
集計期間を過ぎた週単位データは編集しない。
集計期間中の週単位データは毎日更新する。

### 分析データ(月単位)

DynamoDB 上の分析データ(日単位)を月ごとにまとめたもの。月曜日～日曜日までを 1 つの週単位とする。
集計結果をまとめて上位 10 名をまとめて DynamoDB に格納する。
集計期間を過ぎた月単位データは編集しない。
集計期間中の月単位データは毎日更新する。

## 日単位記事情報ファイル構成

```
zenn-ranking-data-bucket
  - yyyy
    - mm
      - yyyymmdd.json
```

## 分析データテーブル構成

### zenn-ranking-analysis-daily-table

| カラム名   | 型     | 説明       | キー | 備考 |
| ---------- | ------ | ---------- | ---- | ---- |
| yyyy-mm-dd | string | 生成年月日 | PK   |      |
| contents   | string | 記事情報   |      |      |

### zenn-ranking-analysis-weekly-table

| カラム名 | 型     | 説明       | キー | 備考                                                                 |
| -------- | ------ | ---------- | ---- | -------------------------------------------------------------------- |
| yyyy-ww  | string | 生成年月日 | PK   | WW:何週目かどうかの数値。1/1 が所属する週単位を 0 とした場合の連番。 |
| contents | string | 記事情報   |      |                                                                      |

### zenn-ranking-analysis-monthly-table

| カラム名 | 型     | 説明       | キー | 備考 |
| -------- | ------ | ---------- | ---- | ---- |
| yyyy-mm  | string | 生成年月日 | PK   |      |
| contents | string | 記事情報   |      |      |

### 共通

contents カラムには以下オブジェクトで articles の配列の長さが 10 になったものを Stringify した結果が格納される。

```json
{
  "articles": [
    {
      "id": 243899,
      "title": "AI でテキストを関西弁に翻訳する「kansAI」の紹介 with Gemini",
      "comments_count": 0,
      "liked_count": 30,
      "article_type": "tech",
      "published_at": "2024-02-26T18:00:00.378+09:00",
      "user": {
        "id": 19167,
        "username": "kou_pg_0131",
        "name": "koki",
        "avatar_small_url": "https://lh3.googleusercontent.com/a-/AOh14Ghb4YGzhOmUME8kf5ygMCjAh9k1xKBO4KugU0LCAg=s96-c"
      }
    }
  ]
}
```

## Zenn API

Zenn が公開している記事情報等の取得 API について記載する。

- BaseUrl
  - https://zenn.dev/api
- rate limit
  - 1 秒あたり 1 リクエスト

### 記事取得

#### Request

- Endpoint
  - https://zenn.dev/api/articles
- QueryParameter
  - page : ページ番号
  - count : 一度に取得する記事数
  - order : 並び替え順
  - topicname : トピック
  - username : ユーザー名

#### Response

```json
{
  "articles": [
    {
      "id": 243899,
      "post_type": "Article",
      "title": "AI でテキストを関西弁に翻訳する「kansAI」の紹介 with Gemini",
      "slug": "kansai-cli-introduction",
      "comments_count": 0,
      "liked_count": 30,
      "body_letters_count": 11432,
      "article_type": "tech",
      "emoji": "💭",
      "is_suspending_private": false,
      "published_at": "2024-02-26T18:00:00.378+09:00",
      "body_updated_at": "2024-02-23T18:42:10.089+09:00",
      "source_repo_updated_at": "2024-02-23T18:42:10.082+09:00",
      "pinned": false,
      "path": "/kou_pg_0131/articles/kansai-cli-introduction",
      "user": {
        "id": 19167,
        "username": "kou_pg_0131",
        "name": "koki",
        "avatar_small_url": "https://lh3.googleusercontent.com/a-/AOh14Ghb4YGzhOmUME8kf5ygMCjAh9k1xKBO4KugU0LCAg=s96-c"
      },
      "publication": null
    },
    {
      "id": 154465,
      "post_type": "Article",
      "title": "cat コマンド代替の Go 製 CLI 「gat」の紹介",
      "slug": "gat-introduction",
      "comments_count": 9,
      "liked_count": 89,
      "body_letters_count": 39102,
      "article_type": "tech",
      "emoji": "🐱",
      "is_suspending_private": false,
      "published_at": "2023-03-20T19:10:50.194+09:00",
      "body_updated_at": "2023-04-22T17:18:38.044+09:00",
      "source_repo_updated_at": "2023-04-22T17:18:38.038+09:00",
      "pinned": false,
      "path": "/kou_pg_0131/articles/gat-introduction",
      "user": {
        "id": 19167,
        "username": "kou_pg_0131",
        "name": "koki",
        "avatar_small_url": "https://lh3.googleusercontent.com/a-/AOh14Ghb4YGzhOmUME8kf5ygMCjAh9k1xKBO4KugU0LCAg=s96-c"
      },
      "publication": null
    }
  ],
  "next_page": 2
}
```

- articles: 記事の配列
- next_page: 次のページ。なければ null。

### ユーザー情報取得

#### Request

- Endpoint
  - https://zenn.dev/api/users/<username>

#### Response

```json
{
  "user": {
    "id": 19167,
    "username": "kou_pg_0131",
    "name": "koki",
    "avatar_small_url": "https://lh3.googleusercontent.com/a-/AOh14Ghb4YGzhOmUME8kf5ygMCjAh9k1xKBO4KugU0LCAg=s96-c",
    "avatar_url": "https://lh3.googleusercontent.com/a-/AOh14Ghb4YGzhOmUME8kf5ygMCjAh9k1xKBO4KugU0LCAg=s96-c",
    "bio": "のんびり生きています。",
    "autolinked_bio": "のんびり生きています。",
    "github_username": "koki-develop",
    "twitter_username": "koki_develop",
    "is_support_open": true,
    "tokusyo_contact": null,
    "tokusyo_name": null,
    "website_url": "https://koki.me",
    "website_domain": "koki.me",
    "total_liked_count": 4304,
    "ga_tracking_id": "G-WW5SRMZM2M",
    "hatena_id": null,
    "is_invoice_issuer": false,
    "follower_count": 209,
    "following_count": 40,
    "following_user_count": 40,
    "following_publication_count": 0,
    "articles_count": 94,
    "books_count": 0,
    "scraps_count": 7
  }
}
```

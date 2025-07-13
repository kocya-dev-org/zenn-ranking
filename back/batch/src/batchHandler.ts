import { APIGatewayProxyEvent } from "aws-lambda";
import axios from "axios";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Tokyo");

const ZENN_API_BASE_URL = "https://zenn.dev/api";
const ARTICLES_ENDPOINT = `${ZENN_API_BASE_URL}/articles`;

export const MAX_API_CALLS = 20;
export const MAX_ARTICLES_COUNT = 100;

const s3Client = new S3Client({ region: "ap-northeast-1" });
const dynamoDbClient = new DynamoDBClient({ region: "ap-northeast-1" });

interface Article {
  id: number;
  post_type: string;
  title: string;
  slug: string;
  comments_count: number;
  liked_count: number;
  body_letters_count: number;
  article_type: string;
  emoji: string;
  published_at: string;
  user: {
    id: number;
    username: string;
    name: string;
    avatar_small_url: string;
  };
  [key: string]: unknown;
}

interface RankingArticle {
  id: number;
  title: string;
  commentsCount: number;
  likedCount: number;
  articleType: string;
  publishedAt: string;
  slug: string;
  user: {
    id: number;
    username: string;
    name: string;
    avatarSmallUrl: string;
  };
}

/**
 * 指定した日付の記事のみを取得する関数
 * @param startDate 対象日付
 * @param endDate 対象日付
 * @returns 記事データの配列
 */
export const fetchArticlesByDate = async (startDate: dayjs.Dayjs, endDate: dayjs.Dayjs): Promise<Article[]> => {
  const articles: Article[] = [];
  let page: number | null = 1;
  let apiCallCount = 0;
  console.log(`Fetching articles from ${startDate} to ${endDate}`);

  while (page && page > 0) {
    try {
      if (++apiCallCount > MAX_API_CALLS) {
        console.log(`最大API呼び出し回数（${MAX_API_CALLS}回）に達しました。処理を終了します。`);
        page = null;
        break;
      }

      // APIの呼び出し間隔を1秒に制限
      if (page > 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log(`Fetching page ${page} from Zenn API (call ${apiCallCount}/${MAX_API_CALLS})...`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await axios.get(ARTICLES_ENDPOINT, {
        params: {
          page: `${page}`,
          count: `${MAX_ARTICLES_COUNT}`, // 1ページあたりの取得件数 (最大100件)
          order: "latest", // 最新順に取得
        },
      });

      const responseData = response?.data;
      const currentArticles = responseData?.articles || [];
      // 記事情報が存在しない
      if (!currentArticles || currentArticles?.length === 0) {
        page = null;
        continue;
      }

      let stopProcess: boolean = false;
      for (const article of currentArticles) {
        const articleDate = dayjs(article.published_at).tz("Asia/Tokyo");
        // 最新からソートしてあるので開始日以前の記事があれば以降は全て古い記事 → 処理を停止
        if (articleDate.isBefore(startDate)) {
          stopProcess = true;
          break;
        }
        // 終了日より後の記事はスキップ
        if (articleDate.isAfter(endDate)) {
          continue;
        }

        if (article.liked_count > 0) {
          delete article.post_type;
          delete article.body_letters_count;
          delete article.article_type;
          delete article.emoji;
          delete article.is_suspending_private;
          delete article.body_updated_at;
          delete article.source_repo_updated_at;
          delete article.pinned;
          delete article.path;
          delete article.publication;
          articles.push(article);
        }
      }
      console.log(`${response.data.articles.length} articles found on page ${page}, total ${articles.length} articles`);

      page = stopProcess ? null : responseData?.next_page;
    } catch (error) {
      console.error("Error fetching articles:", error);
      throw error;
    }
  }

  return articles;
};

/**
 * 記事データをS3に保存する関数
 * @param articles 記事データの配列
 * @param date 対象日付（YYYY-MM-DD形式）
 * @returns 保存の成功・失敗
 */
export const saveArticlesToS3 = async (articles: Article[], date: dayjs.Dayjs): Promise<boolean> => {
  try {
    const formattedDate = date.tz("Asia/Tokyo").format("YYYY-MM-DD");
    const dateParts = formattedDate.split("-");
    const year = dateParts[0];
    const month = dateParts[1];
    const filename = `${formattedDate.replace(/-/g, "")}.json`;
    const key = `${year}/${month}/${filename}`;

    const bucketName = process.env.DATA_BUCKET_NAME;
    if (!bucketName) {
      throw new Error("DATA_BUCKET_NAME environment variable is not set");
    }

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(articles),
      ContentType: "application/json",
    });

    await s3Client.send(command);
    console.log(`Articles saved to S3: s3://${bucketName}/${key}`);
    return true;
  } catch (error) {
    console.error("Error saving articles to S3:", error);
    return false;
  }
};

/**
 * snake_caseの文字列をcamelCaseに変換する関数
 * @param str 変換する文字列
 * @returns 変換後の文字列
 */
export const snakeToCamel = (str: string): string => {
  return str.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
};

/**
 * オブジェクトのキーをsnake_caseからcamelCaseに変換する関数
 * @param obj 変換するオブジェクト
 * @returns 変換後のオブジェクト
 */
export const convertKeysToCamelCase = <T>(obj: unknown): T => {
  if (obj === null || typeof obj !== "object") {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => convertKeysToCamelCase(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const key in obj as Record<string, unknown>) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const camelKey = snakeToCamel(key);
      result[camelKey] = convertKeysToCamelCase((obj as Record<string, unknown>)[key]);
    }
  }
  return result as T;
};

/**
 * 1週間前の開始日を取得する関数
 * @returns 前日から1週間前の日付
 */
export const getStartDayOfPreviousWeek = (date: string): dayjs.Dayjs => {
  return dayjs(date).tz("Asia/Tokyo").set("hour", 0).set("minutes", 0).set("seconds", 0).set("milliseconds", 0).subtract(7, "day");
};

/**
 * S3から記事データを読み込む関数
 * @param date 対象日付
 * @returns 記事データの配列
 */
export const readArticlesFromS3 = async (date: dayjs.Dayjs): Promise<Article[]> => {
  try {
    const formattedDate = date.format("YYYY-MM-DD");
    const dateParts = formattedDate.split("-");
    const year = dateParts[0];
    const month = dateParts[1];
    const filename = `${formattedDate.replace(/-/g, "")}.json`;
    const key = `${year}/${month}/${filename}`;

    const bucketName = process.env.DATA_BUCKET_NAME;
    if (!bucketName) {
      throw new Error("DATA_BUCKET_NAME environment variable is not set");
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();
    if (!body) {
      throw new Error("No data returned from S3");
    }

    const articles: Article[] = JSON.parse(body);
    return articles;
  } catch (error) {
    console.error(`Error reading articles from S3 for date ${date}:`, error);
    throw error;
  }
};

/**
 * 記事データをDynamoDBに保存する関数
 * @param articles 保存する記事データの配列
 * @param date 対象日付
 * @returns 保存の成功・失敗
 */
export const saveArticlesToDynamoDB = async (articles: Article[], date: dayjs.Dayjs): Promise<boolean> => {
  try {
    const formattedDate = date.tz("Asia/Tokyo").format("YYYY-MM-DD");

    const sortedArticles = [...articles].sort((a, b) => b.liked_count - a.liked_count).slice(0, 30);

    const camelCaseArticles: RankingArticle[] = convertKeysToCamelCase<RankingArticle[]>(sortedArticles);

    const contentsObject = {
      articles: camelCaseArticles,
    };

    const tableName = process.env.DAILY_TABLE_NAME;
    if (!tableName) {
      throw new Error("DAILY_TABLE_NAME environment variable is not set");
    }

    const command = new PutItemCommand({
      TableName: tableName,
      Item: {
        "yyyy-mm-dd": { S: formattedDate },
        contents: { S: JSON.stringify(contentsObject) },
        expired: { N: calculateTtlValue(date).toString() }, // TTL属性を追加
      },
    });

    await dynamoDbClient.send(command);
    console.log(`Articles saved to DynamoDB: ${tableName} with key ${formattedDate}`);
    return true;
  } catch (error) {
    console.error(`Error saving articles to DynamoDB for date ${date}:`, error);
    return false;
  }
};

/**
 * 特定の日付の記事を取得してS3に保存する関数
 * @param startDate 対象日付（YYYY-MM-DD形式）
 * @param endDate 対象日付（YYYY-MM-DD形式）
 * @returns 処理の成功・失敗
 */
export const processArticlesForDate = async (startDate: dayjs.Dayjs, endDate: dayjs.Dayjs): Promise<boolean> => {
  try {
    const articles = await fetchArticlesByDate(startDate, endDate);
    console.log(`Fetched ${articles.length} articles for ${startDate} ${endDate}`);

    if (articles.length <= 0) {
      console.log(`No articles found for ${startDate} ${endDate}`);
      return true;
    }
    const saveToS3Success = await saveArticlesToS3(articles, endDate);
    if (!saveToS3Success) {
      return false;
    }

    try {
      const savedArticles = await readArticlesFromS3(endDate);
      const saveToDynamoDBSuccess = await saveArticlesToDynamoDB(savedArticles, endDate);
      return saveToDynamoDBSuccess;
    } catch (error) {
      console.error(`Error processing articles for DynamoDB ${startDate} ${endDate}:`, error);
      return false;
    }
  } catch (error) {
    console.error(`Error processing articles for ${startDate} ${endDate}:`, error);
    return false;
  }
};

/**
 * TTL値を計算する関数（30日後のUnixタイムスタンプ）
 * @param date 基準日付
 * @returns 30日後のUnixタイムスタンプ
 */
export const calculateTtlValue = (date: dayjs.Dayjs): number => {
  return date.add(30, "day").unix();
};

/**
 * Lambda関数のハンドラー
 * @param event APIGatewayProxyEvent
 * @returns レスポンス
 */
export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    console.log(`queryStringParameters.date = ${event.queryStringParameters?.date}`);
    const startDate = getStartDayOfPreviousWeek(event.queryStringParameters?.date || dayjs().tz("Asia/Tokyo").format("YYYY-MM-DD"));
    const endDate = dayjs(startDate).tz("Asia/Tokyo").add(7, "day").subtract(1, "millisecond");
    console.log(`Processing articles for date: ${startDate} ${endDate}`);

    const success = await processArticlesForDate(startDate, endDate);

    return {
      statusCode: success ? 200 : 500,
      body: JSON.stringify({
        message: success ? `Successfully processed articles for ${startDate}` : `Failed to process articles for ${startDate}`,
      }),
    };
  } catch (error) {
    console.error("Error in handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

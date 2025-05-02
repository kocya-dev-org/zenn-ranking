import { APIGatewayProxyEvent } from "aws-lambda";
import axios from "axios";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Tokyo");

const ZENN_API_BASE_URL = "https://zenn.dev/api";
const ARTICLES_ENDPOINT = `${ZENN_API_BASE_URL}/articles`;

export const MAX_API_CALLS = 10;

const s3Client = new S3Client({ region: "ap-northeast-1" });

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
          page,
          count: 100, // 1ページあたりの取得件数 (最大100件)
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

      for (const article of currentArticles) {
        const articleDate = dayjs(article.published_at).tz("Asia/Tokyo");

        if (articleDate.isBefore(startDate)) {
          page = null;
          continue;
        }
        // 終了日より後の記事はスキップ
        if (articleDate.isAfter(endDate)) {
          continue;
        }

        if (article.liked_count > 0) {
          articles.push(article);
        }
      }

      page = responseData?.next_page;
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
 * 1週間前の開始日を取得する関数
 * @returns 前日から1週間前の日付
 */
export const getStartDayOfPreviousWeek = (): dayjs.Dayjs => {
  return dayjs().tz("Asia/Tokyo").set("hour", 0).set("minutes", 0).set("seconds", 0).set("milliseconds", 0).subtract(7, "day");
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
    return await saveArticlesToS3(articles, endDate);
  } catch (error) {
    console.error(`Error processing articles for ${startDate} ${endDate}:`, error);
    return false;
  }
};

/**
 * Lambda関数のハンドラー
 * @param event APIGatewayProxyEvent
 * @returns レスポンス
 */
export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    const startDate = dayjs(event.queryStringParameters?.date) || getStartDayOfPreviousWeek();
    const endDate = dayjs(startDate).add(7, "day").subtract(1, "millisecond");
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

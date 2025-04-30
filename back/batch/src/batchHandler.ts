import { APIGatewayProxyEvent } from "aws-lambda";
import axios from "axios";
import { 
  S3Client, 
  PutObjectCommand 
} from "@aws-sdk/client-s3";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Tokyo");

const ZENN_API_BASE_URL = "https://zenn.dev/api";
const ARTICLES_ENDPOINT = `${ZENN_API_BASE_URL}/articles`;

const MAX_API_CALLS = 10;

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
 * @param targetDate 対象日付（YYYY-MM-DD形式）
 * @returns 記事データの配列
 */
export const fetchArticlesByDate = async (targetDate: string): Promise<Article[]> => {
  const targetDateObj = dayjs(targetDate);
  const articles: Article[] = [];
  let page = 1;
  let shouldContinue = true;
  let apiCallCount = 0;

  while (shouldContinue) {
    try {
      if (++apiCallCount > MAX_API_CALLS) {
        console.log(`最大API呼び出し回数（${MAX_API_CALLS}回）に達しました。処理を終了します。`);
        shouldContinue = false;
        break;
      }

      if (page > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`Fetching page ${page} from Zenn API (call ${apiCallCount}/${MAX_API_CALLS})...`);
      const response = await axios.get(ARTICLES_ENDPOINT, {
        params: {
          page,
        }
      });

      const responseData = response.data;
      const currentArticles = responseData.articles || [];

      if (currentArticles.length === 0) {
        shouldContinue = false;
        continue;
      }

      for (const article of currentArticles) {
        const articleDate = dayjs(article.published_at).tz("Asia/Tokyo").format("YYYY-MM-DD");
        
        if (dayjs(articleDate).isBefore(targetDateObj)) {
          shouldContinue = false;
          break;
        }

        if (articleDate === targetDate && article.liked_count > 0) {
          articles.push(article);
        }
      }

      page++;
    } catch (error) {
      console.error("Error fetching articles:", error);
      shouldContinue = false;
    }
  }

  return articles;
}

/**
 * 記事データをS3に保存する関数
 * @param articles 記事データの配列
 * @param date 対象日付（YYYY-MM-DD形式）
 * @returns 保存の成功・失敗
 */
export const saveArticlesToS3 = async (articles: Article[], date: string): Promise<boolean> => {
  try {
    const dateParts = date.split("-");
    const year = dateParts[0];
    const month = dateParts[1];
    const filename = `${date.replace(/-/g, "")}.json`;
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
}

/**
 * 前日の日付を取得する関数
 * @returns 前日の日付（YYYY-MM-DD形式）
 */
export const getPreviousDay = (): string => {
  return dayjs().tz("Asia/Tokyo").subtract(1, "day").format("YYYY-MM-DD");
}

/**
 * 特定の日付の記事を取得してS3に保存する関数
 * @param date 対象日付（YYYY-MM-DD形式）
 * @returns 処理の成功・失敗
 */
export const processArticlesForDate = async (date: string): Promise<boolean> => {
  try {
    const articles = await fetchArticlesByDate(date);
    console.log(`Fetched ${articles.length} articles for ${date}`);
    
    if (articles.length > 0) {
      return await saveArticlesToS3(articles, date);
    }
    
    console.log(`No articles found for ${date}`);
    return true;
  } catch (error) {
    console.error(`Error processing articles for ${date}:`, error);
    return false;
  }
}

/**
 * Lambda関数のハンドラー
 * @param event APIGatewayProxyEvent
 * @returns レスポンス
 */
export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    const date = event.queryStringParameters?.date || getPreviousDay();
    console.log(`Processing articles for date: ${date}`);
    
    const success = await processArticlesForDate(date);
    
    return {
      statusCode: success ? 200 : 500,
      body: JSON.stringify({ 
        message: success ? `Successfully processed articles for ${date}` : `Failed to process articles for ${date}` 
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

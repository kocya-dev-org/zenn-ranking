import { APIGatewayProxyEvent } from "aws-lambda";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import weekOfYear from "dayjs/plugin/weekOfYear";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(weekOfYear);
dayjs.tz.setDefault("Asia/Tokyo");

const dynamoDBClient = new DynamoDBClient({ region: "ap-northeast-1" });

const TABLES = {
  daily: process.env.DAILY_TABLE_NAME || "zenn-ranking-analysis-daily-table",
  weekly: process.env.WEEKLY_TABLE_NAME || "zenn-ranking-analysis-weekly-table",
  monthly: process.env.MONTHLY_TABLE_NAME || "zenn-ranking-analysis-monthly-table",
};

const UNIT_MAP = {
  daily: TABLES.daily,
  weekly: TABLES.weekly,
  monthly: TABLES.monthly,
};

const VALID_PARAMS = {
  count: [10],
  order: ["liked"],
  unit: ["daily", "weekly", "monthly"],
  range: { min: 1, max: 31 },
};

/**
 * DynamoDBからランキングデータを取得するAPIハンドラー
 * @param event APIGatewayProxyEvent
 * @returns ランキングデータまたはエラーメッセージを含むレスポンス
 */
export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    const params = parseQueryParameters(event.queryStringParameters || {});
    
    if (!params) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "無効なクエリパラメータです" }),
      };
    }

    const data = await fetchRankingData(params);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ data }),
    };
  } catch (error) {
    console.error("ハンドラーでエラーが発生しました:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "内部サーバーエラー" }),
    };
  }
};

/**
 * クエリパラメータの解析とバリデーション
 * @param queryParams リクエストからのクエリパラメータ
 * @returns バリデーション済みのパラメータ、または失敗した場合はnull
 */
interface RankingQueryParams {
  count: number;
  order: string;
  unit: "daily" | "weekly" | "monthly";
  range: number;
}

function parseQueryParameters(queryParams: Record<string, string | undefined>): RankingQueryParams | null {
  const count = queryParams.count ? parseInt(queryParams.count, 10) : 10;
  const order = queryParams.order || "liked";
  const unit = queryParams.unit as "daily" | "weekly" | "monthly";
  const range = queryParams.range ? parseInt(queryParams.range, 10) : 0;

  if (!VALID_PARAMS.count.includes(count)) {
    console.error(`無効なcountパラメータ: ${count}`);
    return null;
  }

  if (!VALID_PARAMS.order.includes(order)) {
    console.error(`無効なorderパラメータ: ${order}`);
    return null;
  }

  if (!VALID_PARAMS.unit.includes(unit)) {
    console.error(`無効なunitパラメータ: ${unit}`);
    return null;
  }

  if (range < VALID_PARAMS.range.min || range > VALID_PARAMS.range.max) {
    console.error(`無効なrangeパラメータ: ${range}`);
    return null;
  }

  return { count, order, unit, range };
}

/**
 * 指定された単位と範囲に基づいて日付キーを生成
 * @param unit 時間単位（日次、週次、月次）
 * @param range 取得する単位数
 * @returns 日付キーの配列
 */
function generateDateKeys(unit: "daily" | "weekly" | "monthly", range: number): string[] {
  const keys: string[] = [];
  const today = dayjs().tz("Asia/Tokyo");

  for (let i = 0; i < range; i++) {
    let key;
    switch (unit) {
      case "daily":
        key = today.subtract(i, "day").format("YYYY-MM-DD");
        break;
      case "weekly":
        key = today.subtract(i, "week").format("YYYY-") + 
              today.subtract(i, "week").week().toString().padStart(2, "0");
        break;
      case "monthly":
        key = today.subtract(i, "month").format("YYYY-MM");
        break;
    }
    keys.push(key);
  }

  return keys;
}

/**
 * 指定されたパラメータに基づいてDynamoDBからランキングデータを取得
 * @param params バリデーション済みのクエリパラメータ
 * @returns ランキングデータオブジェクトの配列
 */
async function fetchRankingData(params: RankingQueryParams) {
  const { unit, range } = params;
  const tableName = UNIT_MAP[unit];
  const dateKeys = generateDateKeys(unit, range);
  
  try {
    const promises = dateKeys.map(async (key) => {
      try {
        const command = new GetItemCommand({
          TableName: tableName,
          Key: {
            [unit === "monthly" ? "yyyy-mm" : "yyyy-mm-dd"]: { S: key },
          },
        });

        const response = await dynamoDBClient.send(command);
        
        if (!response.Item || !response.Item.contents || !response.Item.contents.S) {
          console.log(`キー: ${key} に対するデータが見つかりません`);
          return null;
        }

        const content = JSON.parse(response.Item.contents.S);
        
        return {
          key,
          articles: content.articles || [],
        };
      } catch (error) {
        console.error(`キー ${key} のデータ取得中にエラーが発生しました:`, error);
        throw error;
      }
    });

    const results = await Promise.all(promises);
    return results.filter((result): result is { key: string; articles: unknown[] } => result !== null);
  } catch (error) {
    console.error("fetchRankingDataでエラーが発生しました:", error);
    throw error;
  }
}

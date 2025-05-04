/**
 * ユーザーの基本的なプロフィール情報を表します。
 *
 * @property id - ユーザーの一意の識別子。
 * @property username - ユーザー名またはハンドルネーム。
 * @property name - ユーザーのフルネーム。
 * @property avatarSmallUrl - ユーザーの小さいアバター画像のURL。
 */
export type User = {
  id: number;
  username: string;
  name: string;
  avatarSmallUrl: string;
};
/**
 * 記事情報
 *
 * @property id - 記事の一意の識別子。
 * @property title - 記事のタイトル。
 * @property commentsCount - コメントの数。
 * @property likedCount - いいねの数。
 * @property articleType - 記事の種類。
 * @property publishedAt - 公開日時（ISO 8601形式の文字列）。
 * @property user - 記事の著者に関する情報。
 */
export type ArticleData = {
  id: number;
  title: string;
  commentsCount: number;
  likedCount: number;
  articleType: string;
  publishedAt: string;
  user: User;
  slug: string;
};

/**
 * トレンドを表す集計単位情報
 *
 * @property key - トレンドを一意に識別するためのキー。
 * @property articles - トレンドに関連付けられた記事データの配列。
 */
export type TrendUnit = {
  key: string;
  articles: ArticleData[];
};

/**
 * トレンドデータを表す型
 *
 * @property data - トレンド単位の配列。
 */
export type TrendData = {
  data: TrendUnit[];
};

interface CacheEntry {
  timestamp: number;
  data: TrendData;
}

type CacheKey = string;

const apiCache: Record<CacheKey, CacheEntry> = {};

/**
 * トレンドデータを取得するための関数
 *
 * @param unit - トレンドの集計単位（例: "day", "week", "month"）。
 * @param range - 集計の範囲（例: 1, 7, 30）。
 * @returns - トレンドデータのPromise。
 */
export const getTrends = async (unit: string, range: number): Promise<TrendData> => {
  console.log("getTrends", unit, range);

  const unitMap: Record<string, string> = {
    day: "daily",
    week: "weekly",
    month: "monthly",
  };

  const cacheKey = `${unit}_${range}`;

  const now = Date.now();
  const cachedData = apiCache[cacheKey];
  if (cachedData && now - cachedData.timestamp < 60 * 60 * 1000) {
    console.log("Using cached data for", unit, range);
    return cachedData.data;
  }

  const domain = "dml3tkm972yby.cloudfront.net";
  const apiUrl = `https://${domain}/api/ranking`;

  const params = new URLSearchParams({
    unit: unitMap[unit],
    range: range.toString(),
    count: "30",
    order: "liked",
  });

  try {
    const response = await fetch(`${apiUrl}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data: TrendData = await response.json();

    if (data && data.data) {
      data.data.forEach((unit) => {
        unit.articles.forEach((article) => {
          if (!article.slug) {
            article.slug = article.id.toString();
          }
        });
      });
    }

    apiCache[cacheKey] = {
      timestamp: now,
      data,
    };

    return data;
  } catch (error) {
    console.error("Error fetching trend data:", error);

    if (cachedData) {
      console.log("Using cached data after fetch error");
      return cachedData.data;
    }

    return { data: [] };
  }
};

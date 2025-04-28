import * as dayjs from "dayjs";

/**
 * ユーザーの基本的なプロフィール情報を表します。
 *
 * @property id - ユーザーの一意の識別子。
 * @property userName - ユーザー名またはハンドルネーム。
 * @property name - ユーザーのフルネーム。
 * @property avatarSmallUrl - ユーザーの小さいアバター画像のURL。
 */
export type User = {
  id: number;
  userName: string;
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

/**
 * トレンドデータを取得するための関数
 *
 * @param unit - トレンドの集計単位（例: "day", "week", "month"）。
 * @param range - 集計の範囲（例: 1, 7, 30）。
 * @returns - トレンドデータのPromise。
 */
export const getTrends = async (unit: string, range: number): Promise<TrendData> => {
  await setTimeout(() => {}, 1);
  console.log("getTrends", unit, range);
  // dummy
  const now = new dayjs.Dayjs();
  const getKey = (unit: string, index: number) => {
    switch (unit) {
      case "day":
        return now.add(index - (range - 1), "day").format("YYYY-MM-DD");
      case "week":
        return `W${index.toString().padStart(2, "0")}`;
      case "month":
        return now.add(index - (range - 1), "month").format("YYYY-MM");
      default:
        throw new Error("Invalid unit");
    }
  };

  const getArticles = (index: number) => {
    return {
      id: 1,
      title: `トレンド記事${index}`,
      commentsCount: Math.floor(Math.random() * 100),
      likedCount: Math.floor(Math.random() * 100),
      articleType: "article",
      publishedAt: now.add(index - (range - 1), "day").toISOString(),
      user: {
        id: 1,
        userName: `user${index}`,
        name: `ユーザー${index}`,
        avatarSmallUrl: `https://example.com/avatar${index}.png`,
      },
    };
  };
  const articles = Array.from({ length: 10 }, (_, articlesIndex) => getArticles(articlesIndex));
  const data = Array.from({ length: range }, (_, index) => ({
    key: getKey(unit, index),
    articles: articles,
  }));
  return { data };
};

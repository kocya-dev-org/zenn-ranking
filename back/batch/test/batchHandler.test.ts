import axios from "axios";
import { vi } from "vitest";

vi.mock("axios");

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { handler, fetchArticlesByDate, saveArticlesToS3, getPreviousDay, processArticlesForDate, MAX_API_CALLS } from "../src/batchHandler";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Tokyo");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedAxios = axios as any;

const s3Mock = mockClient(S3Client);

/*
describe("batchHandler", () => {
  describe("handler", () => {
    it("should return a response with status code", async () => {
      // 簡単なテストケース - 実際の実装はモックせずに基本的な動作のみ確認
      const event = {} as APIGatewayProxyEvent;
      const result = await handler(event);
      
      expect(result).toHaveProperty("statusCode");
      expect(result).toHaveProperty("body");
    });
  });
});
*/
describe("batchHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockReset();
    s3Mock.reset();

    process.env.DATA_BUCKET_NAME = "test-bucket";
  });

  describe("getPreviousDay", () => {
    it("前日の日付を返す", () => {
      const today = dayjs();
      const previousDay = today.subtract(1, "day").format("YYYY-MM-DD");
      expect(getPreviousDay()).toBe(previousDay);
    });
  });

  describe("fetchArticlesByDate", () => {
    it("指定日の記事を取得する", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          articles: [
            { id: 1, title: "Article 1", published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 },
            { id: 2, title: "Article 2", published_at: "2025-04-29T14:00:00+09:00", liked_count: 0 }, // liked_count=0なので収集されない
            { id: 3, title: "Article 3", published_at: "2025-04-28T10:00:00+09:00", liked_count: 5 },
          ],
          next_page: null,
        },
      });

      const result = await fetchArticlesByDate("2025-04-29");

      expect(mockedAxios.get).toHaveBeenCalledWith("https://zenn.dev/api/articles", {
        params: { page: 1, count: 100, order: "latest" },
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it("ページネーションを正しく処理する", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          articles: [{ id: 1, title: "Article 1", published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 }],
          next_page: 2,
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          articles: [
            { id: 2, title: "Article 2", published_at: "2025-04-29T10:00:00+09:00", liked_count: 5 },
            { id: 3, title: "Article 3", published_at: "2025-04-28T10:00:00+09:00", liked_count: 5 },
          ],
          next_page: null,
        },
      });

      const result = await fetchArticlesByDate("2025-04-29");

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it("ページネーションを正しく処理する 次ページがnullの場合はそこで終了", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          articles: [{ id: 1, title: "Article 1", published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 }],
          next_page: 2,
        },
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          articles: [{ id: 2, title: "Article 2", published_at: "2025-04-29T13:00:00+09:00", liked_count: 1 }],
          next_page: null,
        },
      });
      // 取得されない想定のダミーデータ
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          articles: [{ id: 3, title: "Article 3", published_at: "2025-04-29T14:00:00+09:00", liked_count: 1 }],
          next_page: null,
        },
      });

      const result = await fetchArticlesByDate("2025-04-29");

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it("最大API呼び出し回数を超えた場合に処理を停止する", async () => {
      for (let i = 1; i <= MAX_API_CALLS; i++) {
        mockedAxios.get.mockResolvedValueOnce({
          data: {
            articles: [{ id: i + 1, title: `Article ${i + 1}`, published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 }],
            next_page: i < MAX_API_CALLS ? i + 1 : null,
          },
        });
      }

      const result = await fetchArticlesByDate("2025-04-29");

      expect(mockedAxios.get).toHaveBeenCalledTimes(MAX_API_CALLS);
      expect(result.length).toBe(MAX_API_CALLS); // 各ページから1記事ずつ取得
    }, 10000); // 1sの遅延と10回呼び出しを考慮して10秒のタイムアウトを設定
  });

  describe("saveArticlesToS3", () => {
    it("記事をS3に保存する", async () => {
      s3Mock.on(PutObjectCommand).resolves({});

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const articles = [{ id: 1, title: "Article 1", published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 }] as any;

      const result = await saveArticlesToS3(articles, "2025-04-29");

      expect(result).toBe(true);

      const calls = s3Mock.commandCalls(PutObjectCommand);
      expect(calls).toHaveLength(1);

      const command = calls[0].args[0];
      expect(command.input.Bucket).toBe("test-bucket");
      expect(command.input.Key).toBe("2025/04/20250429.json");
      expect(command.input.ContentType).toBe("application/json");
    });

    it("環境変数が設定されていない場合はエラーを返す", async () => {
      delete process.env.DATA_BUCKET_NAME;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const articles = [{ id: 1 }] as any;
      const result = await saveArticlesToS3(articles, "2025-04-29");

      expect(result).toBe(false);
    });
  });

  describe("processArticlesForDate", () => {
    it("記事の取得と保存を正常に処理する", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          articles: [
            { id: 1, title: "Article 1", published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 },
            { id: 2, title: "Article 2", published_at: "2025-04-29T14:00:00+09:00", liked_count: 0 }, // liked_count=0なので収集されない
            { id: 3, title: "Article 3", published_at: "2025-04-28T10:00:00+09:00", liked_count: 5 },
          ],
          next_page: null,
        },
      });
      s3Mock.on(PutObjectCommand).resolves({});

      const result = await processArticlesForDate("2025-04-29");

      expect(result).toBe(true);
      const calls = s3Mock.commandCalls(PutObjectCommand);
      expect(calls).toHaveLength(1);

      const command = calls[0].args[0];
      expect(command.input.Bucket).toBe("test-bucket");
      expect(command.input.Key).toBe("2025/04/20250429.json");
      expect(command.input.ContentType).toBe("application/json");
    });

    it("記事が見つからない場合は保存をスキップする", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          articles: [],
        },
      });
      s3Mock.on(PutObjectCommand).resolves({});
      const result = await processArticlesForDate("2025-04-29");

      expect(result).toBe(true);
      const calls = s3Mock.commandCalls(PutObjectCommand);
      expect(calls).toHaveLength(0);
    });
  });

  describe("handler", () => {
    it("クエリパラメータで日付が指定された場合はその日付を使用する", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          articles: [
            { id: 1, title: "Article 1", published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 },
            { id: 2, title: "Article 2", published_at: "2025-04-29T14:00:00+09:00", liked_count: 0 }, // liked_count=0なので収集されない
            { id: 3, title: "Article 3", published_at: "2025-04-28T10:00:00+09:00", liked_count: 5 },
          ],
          next_page: null,
        },
      });
      s3Mock.on(PutObjectCommand).resolves({});

      const event = {
        queryStringParameters: { date: "2025-04-28" },
      } as unknown;
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const calls = s3Mock.commandCalls(PutObjectCommand);
      expect(calls).toHaveLength(1);

      const command = calls[0].args[0];
      expect(command.input.Bucket).toBe("test-bucket");
      expect(command.input.Key).toBe("2025/04/20250428.json");
      expect(command.input.ContentType).toBe("application/json");
    });

    it("処理が失敗した場合は500を返す", async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error("API Error"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const event = {} as any;
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(result.body).toBe(JSON.stringify({ message: `Failed to process articles for ${getPreviousDay()}` }));
    });
  });
});

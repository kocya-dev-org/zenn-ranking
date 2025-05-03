/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from "axios";
import { vi } from "vitest";

vi.mock("axios");

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import {
  handler,
  fetchArticlesByDate,
  saveArticlesToS3,
  getStartDayOfPreviousWeek,
  processArticlesForDate,
  MAX_API_CALLS,
  MAX_ARTICLES_COUNT,
  readArticlesFromS3,
  saveArticlesToDynamoDB,
  snakeToCamel,
  convertKeysToCamelCase,
} from "../src/batchHandler";
import { APIGatewayProxyEvent } from "aws-lambda";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Tokyo");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface TestArticle {
  id: number;
  title: string;
  published_at: string;
  liked_count: number;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedAxios = axios as any;

const s3Mock = mockClient(S3Client);
const dynamoDbMock = mockClient(DynamoDBClient);
/*
describe("batchHandler-raw", () => {
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
    dynamoDbMock.reset();

    process.env.DATA_BUCKET_NAME = "test-bucket";
    process.env.DAILY_TABLE_NAME = "test-daily-table";
  });

  describe("getStartDayOfPreviousWeek", () => {
    it("前日から1週間前の日付を返す", () => {
      const result = getStartDayOfPreviousWeek();
      const now = dayjs().tz("Asia/Tokyo");
      const diff = now.diff(result, "day");
      expect(diff).toBe(7);

      expect(result.hour()).toBe(0);
      expect(result.minute()).toBe(0);
      expect(result.second()).toBe(0);
      expect(result.millisecond()).toBe(0);
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

      const result = await fetchArticlesByDate(dayjs("2025-04-23"), dayjs("2025-04-29T23:59:59+09:00"));

      expect(mockedAxios.get).toHaveBeenCalledWith("https://zenn.dev/api/articles", {
        params: { page: "1", count: `${MAX_ARTICLES_COUNT}`, order: "latest" },
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
    });

    it("ページネーションを正しく処理する", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          articles: [
            { id: 1, title: "Article 1", published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 },
            { id: 2, title: "Article 2", published_at: "2025-04-30T00:00:00+09:00", liked_count: 10 },
          ],
          next_page: 2,
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          articles: [
            { id: 10, title: "Article 3", published_at: "2025-04-29T10:00:00+09:00", liked_count: 5 },
            { id: 11, title: "Article 4", published_at: "2025-04-28T10:00:00+09:00", liked_count: 5 },
            { id: 12, title: "Article 5", published_at: "2025-04-23T00:00:00+09:00", liked_count: 5 },
            { id: 13, title: "Article 6", published_at: "2025-04-22T23:59:59+09:00", liked_count: 5 },
          ],
          next_page: null,
        },
      });

      const result = await fetchArticlesByDate(dayjs("2025-04-23"), dayjs("2025-04-29T23:59:59+09:00"));

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(4);
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

      const result = await fetchArticlesByDate(dayjs("2025-04-23"), dayjs("2025-04-29T23:59:59+09:00"));

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it(
      "最大API呼び出し回数を超えた場合に処理を停止する",
      async () => {
        for (let i = 1; i <= MAX_API_CALLS; i++) {
          mockedAxios.get.mockResolvedValueOnce({
            data: {
              articles: [{ id: i + 1, title: `Article ${i + 1}`, published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 }],
              next_page: i < MAX_API_CALLS ? i + 1 : null,
            },
          });
        }

        const result = await fetchArticlesByDate(dayjs("2025-04-23"), dayjs("2025-04-29T23:59:59+09:00"));
        expect(mockedAxios.get).toHaveBeenCalledTimes(MAX_API_CALLS);
        expect(result.length).toBe(MAX_API_CALLS); // 各ページから1記事ずつ取得
      },
      1000 * MAX_API_CALLS
    ); // 1sの遅延と10回呼び出しを考慮して10秒のタイムアウトを設定
  });

  describe("saveArticlesToS3", () => {
    it("記事をS3に保存する", async () => {
      s3Mock.on(PutObjectCommand).resolves({});

      const articles = [{ id: 1, title: "Article 1", published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 }] as any;

      const result = await saveArticlesToS3(articles, dayjs("2025-04-29"));

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

      const articles = [{ id: 1, title: "Article 1", published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 }] as any;
      const result = await saveArticlesToS3(articles, dayjs("2025-04-29"));

      expect(result).toBe(false);
    });
  });

  describe("snakeToCamel", () => {
    it("snake_caseをcamelCaseに変換する", () => {
      expect(snakeToCamel("snake_case")).toBe("snakeCase");
      expect(snakeToCamel("multiple_word_string")).toBe("multipleWordString");
      expect(snakeToCamel("already_camelCase")).toBe("alreadyCamelCase");
      expect(snakeToCamel("no_change")).toBe("noChange");
    });
  });

  describe("convertKeysToCamelCase", () => {
    it("オブジェクトのキーをsnake_caseからcamelCaseに変換する", () => {
      const input = {
        snake_case: "value",
        nested_object: {
          another_key: "value",
          third_key: "value",
        },
        array_key: [{ item_key: "value" }, { another_item_key: "value" }],
      };

      const expected = {
        snakeCase: "value",
        nestedObject: {
          anotherKey: "value",
          thirdKey: "value",
        },
        arrayKey: [{ itemKey: "value" }, { anotherItemKey: "value" }],
      };

      const result = convertKeysToCamelCase(input);
      expect(result).toEqual(expected);
    });
  });

  describe("readArticlesFromS3", () => {
    it("S3から記事データを読み込む", async () => {
      const mockArticles = [
        { id: 1, title: "Article 1", published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 },
        { id: 2, title: "Article 2", published_at: "2025-04-29T14:00:00+09:00", liked_count: 5 },
      ];

      s3Mock.on(GetObjectCommand).resolves({
        Body: {
          transformToString: () => Promise.resolve(JSON.stringify(mockArticles)),
        } as any,
      });

      const result = await readArticlesFromS3(dayjs("2025-04-29"));

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls).toHaveLength(1);

      const command = calls[0].args[0];
      expect(command.input.Bucket).toBe("test-bucket");
      expect(command.input.Key).toBe("2025/04/20250429.json");

      expect(result).toEqual(mockArticles);
    });

    it("S3から記事データを読み込む際にエラーが発生した場合はエラーをスローする", async () => {
      s3Mock.on(GetObjectCommand).rejects(new Error("S3 error"));

      await expect(readArticlesFromS3(dayjs("2025-04-29"))).rejects.toThrow("S3 error");
    });
  });

  describe("saveArticlesToDynamoDB", () => {
    it("記事データをDynamoDBに保存する", async () => {
      dynamoDbMock.on(PutItemCommand).resolves({});

      const articles = [
        {
          id: 1,
          title: "Article 1",
          published_at: "2025-04-29T12:00:00+09:00",
          liked_count: 10,
          user: { id: 1, username: "user1", name: "User 1", avatar_small_url: "url1" },
        },
        {
          id: 2,
          title: "Article 2",
          published_at: "2025-04-29T14:00:00+09:00",
          liked_count: 5,
          user: { id: 2, username: "user2", name: "User 2", avatar_small_url: "url2" },
        },
      ] as any;

      const result = await saveArticlesToDynamoDB(articles, dayjs("2025-04-29"));

      expect(result).toBe(true);

      const calls = dynamoDbMock.commandCalls(PutItemCommand);
      expect(calls).toHaveLength(1);

      const command = calls[0].args[0];
      expect(command.input.TableName).toBe("test-daily-table");
      expect(command.input.Item).toBeDefined();
      if (command.input.Item) {
        expect(command.input.Item["yyyy-mm-dd"].S).toBe("2025-04-29");
        expect(command.input.Item.contents.S).toBeDefined();
        if (command.input.Item.contents.S) {
          const contents = JSON.parse(command.input.Item.contents.S);
          expect(contents.articles).toHaveLength(2);
          expect(contents.articles[0].id).toBe(1);
          expect(contents.articles[0].likedCount).toBe(10);
          expect(contents.articles[0].user.username).toBe("user1");
        }
      }
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

      s3Mock.on(GetObjectCommand).resolves({
        Body: {
          transformToString: () =>
            Promise.resolve(
              JSON.stringify([
                { id: 1, title: "Article 1", published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 },
                { id: 3, title: "Article 3", published_at: "2025-04-28T10:00:00+09:00", liked_count: 5 },
              ])
            ),
        } as any,
      });
      dynamoDbMock.on(PutItemCommand).resolves({});

      const result = await processArticlesForDate(dayjs("2025-04-23"), dayjs("2025-04-29T23:59:59+09:00"));

      expect(result).toBe(true);
      expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(1);
      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(1);
      expect(dynamoDbMock.commandCalls(PutItemCommand)).toHaveLength(1);
    });

    it("記事が見つからない場合は保存をスキップする", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          articles: [],
        },
      });
      s3Mock.on(PutObjectCommand).resolves({});
      dynamoDbMock.on(PutItemCommand).resolves({});

      const result = await processArticlesForDate(dayjs("2025-04-23"), dayjs("2025-04-29T23:59:59+09:00"));

      expect(result).toBe(true);
      const s3Calls = s3Mock.commandCalls(PutObjectCommand);
      expect(s3Calls).toHaveLength(0);
      const dynamoDbCalls = dynamoDbMock.commandCalls(PutItemCommand);
      expect(dynamoDbCalls).toHaveLength(0);
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

      s3Mock.on(GetObjectCommand).resolves({
        Body: {
          transformToString: () =>
            Promise.resolve(
              JSON.stringify([
                { id: 1, title: "Article 1", published_at: "2025-04-29T12:00:00+09:00", liked_count: 10 },
                { id: 3, title: "Article 3", published_at: "2025-04-28T10:00:00+09:00", liked_count: 5 },
              ])
            ),
        } as any,
      });
      dynamoDbMock.on(PutItemCommand).resolves({});

      const event = {
        queryStringParameters: { date: "2025-04-29" },
      } as unknown as APIGatewayProxyEvent;
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
      const event = {} as APIGatewayProxyEvent;
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toContain(`Failed to process articles for`);
    });
  });
});

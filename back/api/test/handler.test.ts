import { handler } from "../src/handler";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { vi } from "vitest";
import dayjs from "dayjs";
import { APIGatewayProxyEvent } from "aws-lambda";

const dynamoDBMock = mockClient(DynamoDBClient);

function createMockEvent(queryParams: Record<string, string> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: "GET",
    isBase64Encoded: false,
    path: "/",
    pathParameters: null,
    queryStringParameters: queryParams,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent["requestContext"],
    resource: "",
  } as APIGatewayProxyEvent;
}

describe("handler", () => {
  const sampleArticle = {
    id: 12345,
    title: "Test Article",
    commentsCount: 10,
    likedCount: 50,
    articleType: "tech",
    publishedAt: "2024-05-01T12:00:00.000Z",
    user: {
      id: 1,
      username: "testuser",
      name: "Test User",
      avatarSmallUrl: "https://example.com/avatar.png",
    },
  };

  beforeEach(() => {
    dynamoDBMock.reset();
    vi.clearAllMocks();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-05-02"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("無効なunitパラメータの場合は400を返す", async () => {
    const event = createMockEvent({
      unit: "invalid",
      range: "7",
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
  });

  it("無効なrangeパラメータの場合は400を返す", async () => {
    const event = createMockEvent({
      unit: "daily",
      range: "0", // Less than minimum
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
  });

  it("rangeパラメータが最大値を超える場合は400を返す", async () => {
    const event = createMockEvent({
      unit: "daily",
      range: "32", // More than maximum
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
  });

  it("アイテムが見つからない場合は空のデータで200を返す", async () => {
    dynamoDBMock.on(GetItemCommand).resolves({
      Item: undefined,
    });

    const event = createMockEvent({
      unit: "daily",
      range: "1",
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ data: [] });
  });

  it("日次単位のランキングデータの場合は200を返す", async () => {
    const today = dayjs().format("YYYY-MM-DD");

    dynamoDBMock.on(GetItemCommand).resolves({
      Item: {
        "yyyy-mm-dd": { S: today },
        contents: { S: JSON.stringify({ articles: [sampleArticle] }) },
      },
    });

    const event = createMockEvent({
      unit: "daily",
      range: "1",
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const responseBody = JSON.parse(result.body);
    expect(responseBody.data).toHaveLength(1);
    expect(responseBody.data[0].key).toBe(today);
    expect(responseBody.data[0].articles).toHaveLength(1);
    expect(responseBody.data[0].articles[0].id).toBe(12345);
  });

  // パラメータバリデーション強化テスト
  describe("countパラメータのテスト", () => {
    it.each([
      { count: "10", expected: 10 },
      { count: "30", expected: 30 },
    ])("countパラメータが$countの場合、記事数が$expectedに制限される", async ({ count, expected }) => {
      const articles = Array.from({ length: 50 }, (_, i) => ({ id: i, title: `Article ${i}` }));

      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: "2025-05-02" },
          contents: { S: JSON.stringify({ articles }) },
        },
      });

      const event = createMockEvent({
        unit: "daily",
        range: "1",
        count,
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data[0].articles).toHaveLength(expected);
    });

    it("countパラメータが未指定の場合はデフォルト値10が設定される", async () => {
      const articles = Array.from({ length: 50 }, (_, i) => ({ id: i, title: `Article ${i}` }));

      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: "2025-05-02" },
          contents: { S: JSON.stringify({ articles }) },
        },
      });

      const event = createMockEvent({
        unit: "daily",
        range: "1",
        // countパラメータを省略
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data[0].articles).toHaveLength(10);
    });

    it.each([
      "5", // 最小値未満
      "50", // 最大値超過
      "abc", // 数値以外
    ])("countパラメータが無効値($count)の場合は400を返す", async (count) => {
      const event = createMockEvent({
        unit: "daily",
        range: "1",
        count,
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
    });

    it("countパラメータが空文字列の場合は500を返す", async () => {
      const event = createMockEvent({
        unit: "daily",
        range: "1",
        count: "",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({ message: "Internal server error" });
    });
  });

  describe("orderパラメータのテスト", () => {
    it("orderパラメータがデフォルト値(liked)で動作する", async () => {
      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: "2025-05-02" },
          contents: { S: JSON.stringify({ articles: [sampleArticle] }) },
        },
      });

      const event = createMockEvent({
        unit: "daily",
        range: "1",
        // orderパラメータを省略
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data).toHaveLength(1);
    });

    it.each(["invalid", "created"])("orderパラメータが無効値($order)の場合は400を返す", async (order) => {
      const event = createMockEvent({
        unit: "daily",
        range: "1",
        order,
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
    });

    it("orderパラメータが空文字列の場合は500を返す", async () => {
      const event = createMockEvent({
        unit: "daily",
        range: "1",
        order: "",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({ message: "Internal server error" });
    });
  });

  describe("rangeパラメータのテスト", () => {
    it.each([
      { range: "1", expected: 1 }, // 最小値
      { range: "31", expected: 31 }, // 最大値
    ])("rangeパラメータの境界値($range)で正常動作する", async ({ range, expected }) => {
      // 複数の日付に対してモックを設定
      for (let i = 0; i < expected; i++) {
        const date = dayjs().subtract(i, "day").format("YYYY-MM-DD");
        dynamoDBMock
          .on(GetItemCommand, {
            TableName: "zenn-ranking-analysis-daily-table",
            Key: { "yyyy-mm-dd": { S: date } },
          })
          .resolves({
            Item: {
              "yyyy-mm-dd": { S: date },
              contents: { S: JSON.stringify({ articles: [{ ...sampleArticle, id: i }] }) },
            },
          });
      }

      const event = createMockEvent({
        unit: "daily",
        range,
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data).toHaveLength(expected);
    });

    it.each([
      "", // 空文字列
      "-1", // 負の値
    ])("rangeパラメータが数値変換できない場合($range)は400を返す", async (range) => {
      const event = createMockEvent({
        unit: "daily",
        range,
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
    });

    it("rangeパラメータが文字列(abc)の場合は200を返す", async () => {
      // parseInt("abc") は NaN になり、NaN < 1 は false なのでバリデーションを通過してしまう
      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: "2025-05-02" },
          contents: { S: JSON.stringify({ articles: [sampleArticle] }) },
        },
      });

      const event = createMockEvent({
        unit: "daily",
        range: "abc",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).data).toHaveLength(0); // NaNのため0回のループになる
    });
  });

  describe("クエリパラメータの異常系テスト", () => {
    it("queryStringParametersがnullの場合はデフォルト値で動作するがrange=0でバリデーションエラーになる", async () => {
      const event = { ...createMockEvent(), queryStringParameters: null };

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
    });
  });

  describe("各単位のデータ取得テスト", () => {
    it("週次単位のランキングデータを正常取得する", async () => {
      const currentWeek = dayjs().week().toString().padStart(2, "0");
      const weekKey = `2025-${currentWeek}`;

      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: weekKey },
          contents: { S: JSON.stringify({ articles: [sampleArticle] }) },
        },
      });

      const event = createMockEvent({
        unit: "weekly",
        range: "1",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data).toHaveLength(1);
      expect(responseBody.data[0].key).toBe(weekKey);
      expect(responseBody.data[0].articles).toHaveLength(1);
    });

    it("月次単位のランキングデータを正常取得する", async () => {
      const monthKey = "2025-05";

      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm": { S: monthKey },
          contents: { S: JSON.stringify({ articles: [sampleArticle] }) },
        },
      });

      const event = createMockEvent({
        unit: "monthly",
        range: "1",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data).toHaveLength(1);
      expect(responseBody.data[0].key).toBe(monthKey);
      expect(responseBody.data[0].articles).toHaveLength(1);
    });
  });

  describe("複数データ取得とソートテスト", () => {
    it("複数日分のデータを取得してソートされる", async () => {
      const today = "2025-05-02";
      const yesterday = "2025-05-01";

      dynamoDBMock
        .on(GetItemCommand, { TableName: "zenn-ranking-analysis-daily-table", Key: { "yyyy-mm-dd": { S: today } } })
        .resolves({
          Item: {
            "yyyy-mm-dd": { S: today },
            contents: { S: JSON.stringify({ articles: [{ id: 1, title: "Today" }] }) },
          },
        })
        .on(GetItemCommand, { TableName: "zenn-ranking-analysis-daily-table", Key: { "yyyy-mm-dd": { S: yesterday } } })
        .resolves({
          Item: {
            "yyyy-mm-dd": { S: yesterday },
            contents: { S: JSON.stringify({ articles: [{ id: 2, title: "Yesterday" }] }) },
          },
        });

      const event = createMockEvent({
        unit: "daily",
        range: "2",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data).toHaveLength(2);
      // 日付順でソートされていることを確認
      expect(responseBody.data[0].key).toBe(yesterday);
      expect(responseBody.data[1].key).toBe(today);
    });

    it("一部のデータが存在しない場合は存在するデータのみ返す", async () => {
      const today = "2025-05-02";
      const yesterday = "2025-05-01";

      dynamoDBMock
        .on(GetItemCommand, { TableName: "zenn-ranking-analysis-daily-table", Key: { "yyyy-mm-dd": { S: today } } })
        .resolves({
          Item: {
            "yyyy-mm-dd": { S: today },
            contents: { S: JSON.stringify({ articles: [{ id: 1, title: "Today" }] }) },
          },
        })
        .on(GetItemCommand, { TableName: "zenn-ranking-analysis-daily-table", Key: { "yyyy-mm-dd": { S: yesterday } } })
        .resolves({
          Item: undefined, // データが存在しない
        });

      const event = createMockEvent({
        unit: "daily",
        range: "2",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data).toHaveLength(1);
      expect(responseBody.data[0].key).toBe(today);
    });
  });

  describe("エラーハンドリングの強化テスト", () => {
    it("contentsフィールドが存在しない場合は空データで処理される", async () => {
      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: "2025-05-02" },
          // contentsフィールドが存在しない
        },
      });

      const event = createMockEvent({
        unit: "daily",
        range: "1",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({ data: [] });
    });

    it("contents.Sフィールドが存在しない場合は空データで処理される", async () => {
      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: "2025-05-02" },
          contents: { N: "123" }, // 文字列型でない
        },
      });

      const event = createMockEvent({
        unit: "daily",
        range: "1",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({ data: [] });
    });

    it("JSONパースに失敗した場合は500エラーを返す", async () => {
      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: "2025-05-02" },
          contents: { S: "invalid json" }, // 不正なJSON
        },
      });

      const event = createMockEvent({
        unit: "daily",
        range: "1",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({ message: "Internal server error" });
    });
  });

  it("DynamoDBクライアントがエラーをスローする場合は500を返す", async () => {
    dynamoDBMock.on(GetItemCommand).rejects(new Error("DynamoDB error"));

    const event = createMockEvent({
      unit: "daily",
      range: "1",
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ message: "Internal server error" });
  });
});

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

    it("countパラメータが空文字列の場合はデフォルト値(10)が使用される", async () => {
      // parseInt("")はNaNを返すが、三項演算子でデフォルト値(10)が使用される
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
        count: "",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data[0].articles).toHaveLength(10);
    });

    it.each([
      "9", // 境界値未満
      "11", // 境界値付近
      "29", // 境界値付近
      "31", // 境界値超過
    ])("countパラメータが境界値付近($count)の場合は400を返す", async (count) => {
      const event = createMockEvent({
        unit: "daily",
        range: "1",
        count,
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
    });

    it.each([
      { count: "10.5", expected: 10 }, // 小数点(整数部分が使用される)
      { count: "30.9", expected: 30 }, // 小数点(整数部分が使用される)
    ])("countパラメータが小数点($count)の場合は整数部分が使用される", async ({ count, expected }) => {
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

    it.each([
      "010", // 先頭ゼロ(10として解釈される)
      "030", // 先頭ゼロ(30として解釈される)
    ])("countパラメータが先頭ゼロ付き($count)の場合は正常動作する", async (count) => {
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
      const expectedCount = parseInt(count, 10);
      expect(responseBody.data[0].articles).toHaveLength(expectedCount);
    });

    it("countパラメータが非常に大きな値の場合は400を返す", async () => {
      const event = createMockEvent({
        unit: "daily",
        range: "1",
        count: "999999",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
    });

    it("countパラメータに特殊文字が含まれる('10a')場合は数値部分が使用される", async () => {
      // parseInt('10a')は10を返す
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
        count: "10a",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data[0].articles).toHaveLength(10);
    });

    it("countパラメータに特殊文字が含まれる('3@0')場合は400を返す", async () => {
      // parseInt('3@0')は3を返すが、10や30ではないのでバリデーションエラー
      const event = createMockEvent({
        unit: "daily",
        range: "1",
        count: "3@0",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
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

    it("orderパラメータが空文字列の場合はデフォルト値(liked)が使用される", async () => {
      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: "2025-05-02" },
          contents: { S: JSON.stringify({ articles: [sampleArticle] }) },
        },
      });

      const event = createMockEvent({
        unit: "daily",
        range: "1",
        order: "",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data).toHaveLength(1);
    });

    it.each(["LIKED", "Liked"])("orderパラメータが大文字($order)の場合は400を返す", async (order) => {
      const event = createMockEvent({
        unit: "daily",
        range: "1",
        order,
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
    });
  });

  describe("unitパラメータのテスト", () => {
    it("unitパラメータが空文字列の場合は400を返す", async () => {
      const event = createMockEvent({
        unit: "",
        range: "1",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
    });

    it.each(["DAILY", "Daily", "WEEKLY", "Weekly", "MONTHLY", "Monthly"])(
      "unitパラメータが大文字($unit)の場合は400を返す",
      async (unit) => {
        const event = createMockEvent({
          unit,
          range: "1",
        });

        const result = await handler(event);
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
      }
    );

    it("unitパラメータが複数値の場合は400を返す", async () => {
      const event = createMockEvent({
        unit: "daily,weekly",
        range: "1",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
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

    it("rangeパラメータが文字列(abc)の場合は400を返す", async () => {
      // parseInt("abc") は NaN になり、isNaN()チェックで検出される
      const event = createMockEvent({
        unit: "daily",
        range: "abc",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
    });

    it.each([
      { range: "2", expected: 2 }, // 境界値付近
      { range: "30", expected: 30 }, // 境界値付近
    ])("rangeパラメータの境界値付近($range)で正常動作する", async ({ range, expected }) => {
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
      "1.5", // 小数点
      "31.9", // 小数点
    ])("rangeパラメータが小数点($range)の場合は正常動作する(整数部分が使用される)", async (range) => {
      const expectedRange = Math.floor(parseFloat(range));
      
      for (let i = 0; i < expectedRange; i++) {
        const date = dayjs().subtract(i, "day").format("YYYY-MM-DD");
        dynamoDBMock
          .on(GetItemCommand, {
            TableName: "zenn-ranking-analysis-daily-table",
            Key: { "yyyy-mm-dd": { S: date } },
          })
          .resolves({
            Item: {
              "yyyy-mm-dd": { S: date },
              contents: { S: JSON.stringify({ articles: [sampleArticle] }) },
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
      expect(responseBody.data).toHaveLength(expectedRange);
    });

    it.each([
      "01", // 先頭ゼロ(1として解釈される)
      "031", // 先頭ゼロ(31として解釈される)
    ])("rangeパラメータが先頭ゼロ付き($range)の場合は正常動作する", async (range) => {
      const expectedRange = parseInt(range, 10);
      
      for (let i = 0; i < expectedRange; i++) {
        const date = dayjs().subtract(i, "day").format("YYYY-MM-DD");
        dynamoDBMock
          .on(GetItemCommand, {
            TableName: "zenn-ranking-analysis-daily-table",
            Key: { "yyyy-mm-dd": { S: date } },
          })
          .resolves({
            Item: {
              "yyyy-mm-dd": { S: date },
              contents: { S: JSON.stringify({ articles: [sampleArticle] }) },
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
      expect(responseBody.data).toHaveLength(expectedRange);
    });

    it("rangeパラメータが非常に大きな値の場合は400を返す", async () => {
      const event = createMockEvent({
        unit: "daily",
        range: "999999",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
    });

    it.each([
      { range: "1a", expected: 1 }, // 数値+文字(数値部分が使用される)
      { range: "3@1", expected: 3 }, // 特殊文字混在(数値部分が使用される)
    ])("rangeパラメータに特殊文字が含まれる($range)場合は数値部分が使用される", async ({ range, expected }) => {
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
              contents: { S: JSON.stringify({ articles: [sampleArticle] }) },
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

    it("複数週のデータを取得してソートされる", async () => {
      vi.setSystemTime(new Date("2025-01-15")); // 2025年1月15日に設定

      const week1 = dayjs().week().toString().padStart(2, "0");
      const week2 = dayjs().subtract(1, "week").week().toString().padStart(2, "0");

      const weekKey1 = `2025-${week1}`;
      const weekKey2 = `2025-${week2}`;

      dynamoDBMock
        .on(GetItemCommand, {
          TableName: "zenn-ranking-analysis-weekly-table",
          Key: { "yyyy-mm-dd": { S: weekKey1 } },
        })
        .resolves({
          Item: {
            "yyyy-mm-dd": { S: weekKey1 },
            contents: { S: JSON.stringify({ articles: [{ id: 1, title: "This Week" }] }) },
          },
        })
        .on(GetItemCommand, {
          TableName: "zenn-ranking-analysis-weekly-table",
          Key: { "yyyy-mm-dd": { S: weekKey2 } },
        })
        .resolves({
          Item: {
            "yyyy-mm-dd": { S: weekKey2 },
            contents: { S: JSON.stringify({ articles: [{ id: 2, title: "Last Week" }] }) },
          },
        });

      const event = createMockEvent({
        unit: "weekly",
        range: "2",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data).toHaveLength(2);
      // 週番号順でソートされていることを確認
      expect(responseBody.data[0].key).toBe(weekKey2);
      expect(responseBody.data[1].key).toBe(weekKey1);
    });

    it("複数月のデータを取得してソートされる", async () => {
      const thisMonth = "2025-05";
      const lastMonth = "2025-04";

      dynamoDBMock
        .on(GetItemCommand, {
          TableName: "zenn-ranking-analysis-monthly-table",
          Key: { "yyyy-mm": { S: thisMonth } },
        })
        .resolves({
          Item: {
            "yyyy-mm": { S: thisMonth },
            contents: { S: JSON.stringify({ articles: [{ id: 1, title: "This Month" }] }) },
          },
        })
        .on(GetItemCommand, {
          TableName: "zenn-ranking-analysis-monthly-table",
          Key: { "yyyy-mm": { S: lastMonth } },
        })
        .resolves({
          Item: {
            "yyyy-mm": { S: lastMonth },
            contents: { S: JSON.stringify({ articles: [{ id: 2, title: "Last Month" }] }) },
          },
        });

      const event = createMockEvent({
        unit: "monthly",
        range: "2",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data).toHaveLength(2);
      // 月順でソートされていることを確認
      expect(responseBody.data[0].key).toBe(lastMonth);
      expect(responseBody.data[1].key).toBe(thisMonth);
    });

    it("年をまたぐ月次データを正常取得する", async () => {
      vi.setSystemTime(new Date("2025-01-15")); // 2025年1月15日に設定

      const thisMonth = "2025-01";
      const lastMonth = "2024-12";

      dynamoDBMock
        .on(GetItemCommand, {
          TableName: "zenn-ranking-analysis-monthly-table",
          Key: { "yyyy-mm": { S: thisMonth } },
        })
        .resolves({
          Item: {
            "yyyy-mm": { S: thisMonth },
            contents: { S: JSON.stringify({ articles: [{ id: 1, title: "January 2025" }] }) },
          },
        })
        .on(GetItemCommand, {
          TableName: "zenn-ranking-analysis-monthly-table",
          Key: { "yyyy-mm": { S: lastMonth } },
        })
        .resolves({
          Item: {
            "yyyy-mm": { S: lastMonth },
            contents: { S: JSON.stringify({ articles: [{ id: 2, title: "December 2024" }] }) },
          },
        });

      const event = createMockEvent({
        unit: "monthly",
        range: "2",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data).toHaveLength(2);
      // 年をまたいでも正しくソートされていることを確認
      expect(responseBody.data[0].key).toBe(lastMonth);
      expect(responseBody.data[1].key).toBe(thisMonth);
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

  describe("記事データの境界ケーステスト", () => {
    it("articlesが空配列の場合は空データで返す", async () => {
      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: "2025-05-02" },
          contents: { S: JSON.stringify({ articles: [] }) },
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
      expect(responseBody.data[0].articles).toHaveLength(0);
    });

    it("articlesがnullの場合は空データで返す", async () => {
      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: "2025-05-02" },
          contents: { S: JSON.stringify({ articles: null }) },
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
      expect(responseBody.data[0].articles).toHaveLength(0);
    });

    it("articlesがundefinedの場合は空データで返す", async () => {
      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: "2025-05-02" },
          contents: { S: JSON.stringify({}) }, // articlesフィールドが存在しない
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
      expect(responseBody.data[0].articles).toHaveLength(0);
    });

    it("記事数がcountより少ない場合は存在する記事数のみ返す", async () => {
      const articles = Array.from({ length: 5 }, (_, i) => ({ id: i, title: `Article ${i}` }));

      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: "2025-05-02" },
          contents: { S: JSON.stringify({ articles }) },
        },
      });

      const event = createMockEvent({
        unit: "daily",
        range: "1",
        count: "10", // 10件要求だが5件しかない
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data[0].articles).toHaveLength(5);
    });

    it("記事数がcountと同じ場合は全記事を返す", async () => {
      const articles = Array.from({ length: 10 }, (_, i) => ({ id: i, title: `Article ${i}` }));

      dynamoDBMock.on(GetItemCommand).resolves({
        Item: {
          "yyyy-mm-dd": { S: "2025-05-02" },
          contents: { S: JSON.stringify({ articles }) },
        },
      });

      const event = createMockEvent({
        unit: "daily",
        range: "1",
        count: "10",
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.data[0].articles).toHaveLength(10);
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

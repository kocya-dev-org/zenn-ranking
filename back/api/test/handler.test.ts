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
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: ""
  } as APIGatewayProxyEvent;
}

describe("handler", () => {
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
    expect(JSON.parse(result.body)).toEqual({ message: "無効なクエリパラメータです" });
  });

  it("無効なrangeパラメータの場合は400を返す", async () => {
    const event = createMockEvent({
      unit: "daily",
      range: "0", // Less than minimum
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ message: "無効なクエリパラメータです" });
  });

  it("rangeパラメータが最大値を超える場合は400を返す", async () => {
    const event = createMockEvent({
      unit: "daily",
      range: "32", // More than maximum
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ message: "無効なクエリパラメータです" });
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
    
    const sampleArticle = {
      id: 12345,
      title: "Test Article",
      commentsCount: 10,
      likedCount: 50,
      articleType: "tech",
      publishedAt: "2024-05-01T12:00:00.000Z",
      user: {
        id: 1,
        userName: "testuser",
        name: "Test User",
        avatarSmallUrl: "https://example.com/avatar.png",
      },
    };
    
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

  it("DynamoDBクライアントがエラーをスローする場合は500を返す", async () => {
    dynamoDBMock.on(GetItemCommand).rejects(new Error("DynamoDB error"));

    const event = createMockEvent({
      unit: "daily",
      range: "1",
    });
    
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ message: "内部サーバーエラー" });
  });
});

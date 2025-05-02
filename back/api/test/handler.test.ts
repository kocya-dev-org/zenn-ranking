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
  });

  it("should return 400 for invalid unit parameter", async () => {
    const event = createMockEvent({
      unit: "invalid",
      range: "7",
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
  });

  it("should return 400 for invalid range parameter", async () => {
    const event = createMockEvent({
      unit: "daily",
      range: "0", // Less than minimum
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
  });

  it("should return 400 for range parameter exceeding maximum", async () => {
    const event = createMockEvent({
      unit: "daily",
      range: "32", // More than maximum
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ message: "Invalid query parameters" });
  });

  it("should return 200 with empty data when no items found", async () => {
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

  it("should return 200 with ranking data for daily unit", async () => {
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

  it("should return 500 when DynamoDB client throws an error", async () => {
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

import { describe, it, expect } from "vitest";
import { handler } from "../src/batchHandler";
import { APIGatewayProxyEvent } from "aws-lambda";

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

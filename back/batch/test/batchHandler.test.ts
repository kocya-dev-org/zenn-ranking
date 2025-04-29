import { handler } from "../src/batchHandler";
import { APIGatewayProxyEvent } from "aws-lambda";

describe("handler", () => {
  it("should return a default greeting message", async () => {
    const event = {} as APIGatewayProxyEvent;
    const result = await handler(event);
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: "Hello, World!" }),
    });
  });
});

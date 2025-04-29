import { handler } from "../src/handler";

describe("handler", () => {
  it("should return a default greeting message", async () => {
    const event = {};
    const result = await handler(event);
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: "Hello, World!" }),
    });
  });
});

import { APIGatewayProxyEvent } from "@types/aws-lambda";

export const handler = async (event: APIGatewayProxyEvent) => {
  const { name } = event.queryStringParameters || { name: "World" };
  return {
    statusCode: 200,
    body: JSON.stringify({ message: `Hello, ${name}!` }),
  };
};

import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { CdkStack } from "../lib/cdk-stack";

describe("CdkStack", () => {
  let app: cdk.App;
  let stack: CdkStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new CdkStack(app, "TestStack");
    template = Template.fromStack(stack);
  });

  it("S3バケットがライフサイクルルールと共に作成される", () => {
    // 収集データ保存用S3バケット
    template.hasResourceProperties("AWS::S3::Bucket", {
      LifecycleConfiguration: {
        Rules: [
          {
            Id: "delete-old-data",
            Status: "Enabled",
            ExpirationInDays: 30,
          },
        ],
      },
    });
  });

  it("DynamoDBテーブルがTTL属性と共に作成される", () => {
    // 分析データ保存用DynamoDBテーブル
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "zenn-ranking-analysis-daily-table",
      AttributeDefinitions: [
        {
          AttributeName: "yyyy-mm-dd",
          AttributeType: "S",
        },
      ],
      KeySchema: [
        {
          AttributeName: "yyyy-mm-dd",
          KeyType: "HASH",
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
      TimeToLiveSpecification: {
        AttributeName: "expired",
        Enabled: true,
      },
    });
  });

  it("Lambda関数が作成される", () => {
    // API用Lambda関数
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs20.x",
      Timeout: 900, // 15分
      MemorySize: 1024,
    });

    // バッチ用Lambda関数
    template.resourceCountIs("AWS::Lambda::Function", 2);
  });

  it("API Gatewayが作成される", () => {
    template.hasResourceProperties("AWS::ApiGateway::RestApi", {
      Name: "zenn-ranking-api",
    });
  });

  it("CloudFrontディストリビューションが作成される", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {});
  });

  it("EventBridgeルールが作成される", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      ScheduleExpression: "cron(0 16 * * ? *)",
    });
  });

  it("IAMロールが適切な権限で作成される", () => {
    // API用ロール
    template.hasResourceProperties("AWS::IAM::Role", {
      RoleName: "zenn-ranking-api-role",
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "lambda.amazonaws.com",
            },
            Action: "sts:AssumeRole",
          },
        ],
      },
    });

    // バッチ用ロール
    template.hasResourceProperties("AWS::IAM::Role", {
      RoleName: "zenn-ranking-batch-role",
    });
  });
});

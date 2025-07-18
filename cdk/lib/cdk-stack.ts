import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const PREFIX = "zenn-ranking";
    const API_PATH = "api";

    // コンテンツ公開用S3バケット
    const webappBucket = new s3.Bucket(this, `${PREFIX}-webapp-bucket`, {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // 収集データ保存用S3バケット
    const dataBucket = new s3.Bucket(this, `${PREFIX}-data-bucket`, {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: "delete-old-data",
          enabled: true,
          expiration: cdk.Duration.days(30), // 30日後に自動削除
        },
      ],
    });

    // 分析データ保存用DynamoDBテーブル
    const dailyTable = new dynamodb.Table(this, `${PREFIX}-analysis-daily-table`, {
      tableName: `${PREFIX}-analysis-daily-table`,
      partitionKey: { name: "yyyy-mm-dd", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "expired", // TTL属性を追加
    });

    //-----------------------------------
    // API用Lambda関数の設定
    //-----------------------------------
    // API用ロググループ
    const apiHandlerLogGroup = new logs.LogGroup(this, `${PREFIX}-api-handler-logs`, {
      logGroupName: `/aws/lambda/${PREFIX}-api-handler`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // API用Lambda関数
    const apiHandler = new nodejs.NodejsFunction(this, `${PREFIX}-api-handler`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: "../back/api/src/handler.ts",
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      role: new iam.Role(this, `${PREFIX}-api-handler-role`, {
        roleName: `${PREFIX}-api-role`,
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaDynamoDBExecutionRole"),
        ],
      }),
      environment: {
        DAILY_TABLE_NAME: dailyTable.tableName,
        LOG_LEVEL: "INFO",
      },
      logGroup: apiHandlerLogGroup,
    });

    //-----------------------------------
    // バッチ用Lambda関数の設定
    //-----------------------------------
    // バッチ処理用ロググループ
    const batchHandlerLogGroup = new logs.LogGroup(this, `${PREFIX}-batch-handler-logs`, {
      logGroupName: `/aws/lambda/${PREFIX}-batch-handler`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // バッチ処理用Lambda関数
    const batchHandler = new nodejs.NodejsFunction(this, `${PREFIX}-batch-handler`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: "../back/batch/src/batchHandler.ts",
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      role: new iam.Role(this, `${PREFIX}-batch-handler-role`, {
        roleName: `${PREFIX}-batch-role`,
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaDynamoDBExecutionRole"),
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonS3ObjectLambdaExecutionRolePolicy"),
        ],
      }),
      environment: {
        DATA_BUCKET_NAME: dataBucket.bucketName,
        DAILY_TABLE_NAME: dailyTable.tableName,
        LOG_LEVEL: "INFO",
      },
      logGroup: batchHandlerLogGroup,
    });

    // 権限設定
    dailyTable.grantReadWriteData(apiHandler);
    dailyTable.grantReadWriteData(batchHandler);
    dataBucket.grantReadWrite(batchHandler);

    //-----------------------------------
    // API Gatewayの設定
    //-----------------------------------
    // API Gatewayのロググループ
    const apiLogGroup = new logs.LogGroup(this, `${PREFIX}-api-logs`, {
      logGroupName: `/aws/apigateway/${PREFIX}-api`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // API GatewayaとLambdaの統合
    const api = new apigateway.RestApi(this, `${PREFIX}-api`, {
      restApiName: `${PREFIX}-api`,
      deployOptions: {
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
      cloudWatchRole: true,
    });
    const apiResource = api.root.addResource(API_PATH);
    const rankingResource = apiResource.addResource("ranking");
    rankingResource.addMethod("GET", new apigateway.LambdaIntegration(apiHandler));

    //------------------------------------
    // EventBridgeの設定
    //------------------------------------
    // 定期実行のルールを作成
    const rule = new events.Rule(this, `${PREFIX}-daily-rule`, {
      schedule: events.Schedule.cron({ minute: "0", hour: "16", day: "*", month: "*", year: "*" }),
    });
    rule.addTarget(new targets.LambdaFunction(batchHandler));
    // 権限設定
    batchHandler.grantInvoke(new iam.ServicePrincipal("events.amazonaws.com"));

    //------------------------------------
    // CloudFrontの設定
    //------------------------------------
    // CloudFrontのキャッシュポリシー
    const apiCachePolicy = new cloudfront.CachePolicy(this, `${PREFIX}-api-cache-policy`, {
      cachePolicyName: `${PREFIX}-api-cache-policy`,
      comment: "Cache policy for API requests",
      defaultTtl: cdk.Duration.hours(6),
      minTtl: cdk.Duration.minutes(5),
      maxTtl: cdk.Duration.hours(6),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList("count", "order", "unit", "range"),
    });

    // CloudFrontの設定
    const distribution = new cloudfront.Distribution(this, `${PREFIX}-distribution`, {
      defaultBehavior: {
        origin: new origins.S3Origin(webappBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        [`/${API_PATH}/*`]: {
          origin: new origins.RestApiOrigin(api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: apiCachePolicy, // カスタムキャッシュポリシーを適用
        },
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
    });

    new cdk.CfnOutput(this, "WebsiteURL", {
      value: `https://${distribution.distributionDomainName}`,
      description: "Website URL",
    });

    //------------------------------------
    // S3バケットのデプロイ対象ファイルの設定
    //------------------------------------
    try {
      const distPath = "../webapp/dist";
      new s3deploy.BucketDeployment(this, `${PREFIX}-webapp-deployment`, {
        sources: [s3deploy.Source.asset(distPath)],
        destinationBucket: webappBucket,
        distribution,
        distributionPaths: ["/*"],
      });
    } catch {
      new cdk.CfnOutput(this, "WebappDeploymentInfo", {
        value: "Webapp will be deployed during the CI/CD pipeline",
        description: "Webapp deployment information",
      });
    }
  }
}

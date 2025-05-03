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

    const webappBucket = new s3.Bucket(this, `${PREFIX}-webapp-bucket`, {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const dataBucket = new s3.Bucket(this, `${PREFIX}-data-bucket`, {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const dailyTable = new dynamodb.Table(this, `${PREFIX}-analysis-daily-table`, {
      tableName: `${PREFIX}-analysis-daily-table`,
      partitionKey: { name: "yyyy-mm-dd", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const weeklyTable = new dynamodb.Table(this, `${PREFIX}-analysis-weekly-table`, {
      tableName: `${PREFIX}-analysis-weekly-table`,
      partitionKey: { name: "yyyy-mm-dd", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const monthlyTable = new dynamodb.Table(this, `${PREFIX}-analysis-monthly-table`, {
      tableName: `${PREFIX}-analysis-monthly-table`,
      partitionKey: { name: "yyyy-mm", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const apiHandlerLogGroup = new logs.LogGroup(this, `${PREFIX}-api-handler-logs`, {
      logGroupName: `/aws/lambda/${PREFIX}-api-handler`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

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
        WEEKLY_TABLE_NAME: weeklyTable.tableName,
        MONTHLY_TABLE_NAME: monthlyTable.tableName,
        LOG_LEVEL: "INFO",
      },
      logGroup: apiHandlerLogGroup,
    });

    const batchHandlerLogGroup = new logs.LogGroup(this, `${PREFIX}-batch-handler-logs`, {
      logGroupName: `/aws/lambda/${PREFIX}-batch-handler`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

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
        WEEKLY_TABLE_NAME: weeklyTable.tableName,
        MONTHLY_TABLE_NAME: monthlyTable.tableName,
        LOG_LEVEL: "INFO",
      },
      logGroup: batchHandlerLogGroup,
    });

    dailyTable.grantReadWriteData(apiHandler);
    weeklyTable.grantReadWriteData(apiHandler);
    monthlyTable.grantReadWriteData(apiHandler);

    dailyTable.grantReadWriteData(batchHandler);
    weeklyTable.grantReadWriteData(batchHandler);
    monthlyTable.grantReadWriteData(batchHandler);

    dataBucket.grantReadWrite(batchHandler);

    const apiLogGroup = new logs.LogGroup(this, `${PREFIX}-api-logs`, {
      logGroupName: `/aws/apigateway/${PREFIX}-api`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

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

    const rule = new events.Rule(this, `${PREFIX}-daily-rule`, {
      schedule: events.Schedule.cron({ minute: "0", hour: "16", day: "*", month: "*", year: "*" }),
    });
    rule.addTarget(new targets.LambdaFunction(batchHandler));

    batchHandler.grantInvoke(new iam.ServicePrincipal("events.amazonaws.com"));

    const apiCachePolicy = new cloudfront.CachePolicy(this, `${PREFIX}-api-cache-policy`, {
      cachePolicyName: `${PREFIX}-api-cache-policy`,
      comment: "Cache policy for API requests",
      defaultTtl: cdk.Duration.days(1),
      minTtl: cdk.Duration.minutes(5),
      maxTtl: cdk.Duration.days(1),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList("count", "order", "unit", "range"),
    });

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

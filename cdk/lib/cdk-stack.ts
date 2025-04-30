import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as fs from 'fs-extra';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const PREFIX = 'zenn-ranking';
    const API_PATH = 'api';

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
      partitionKey: { name: 'yyyy-mm-dd', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const weeklyTable = new dynamodb.Table(this, `${PREFIX}-analysis-weekly-table`, {
      tableName: `${PREFIX}-analysis-weekly-table`,
      partitionKey: { name: 'yyyy-ww', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const monthlyTable = new dynamodb.Table(this, `${PREFIX}-analysis-monthly-table`, {
      tableName: `${PREFIX}-analysis-monthly-table`,
      partitionKey: { name: 'yyyy-mm', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const apiHandler = new lambda.Function(this, `${PREFIX}-api-handler`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('../back/api'),
      handler: 'src/handler.handler',
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        DAILY_TABLE_NAME: dailyTable.tableName,
        WEEKLY_TABLE_NAME: weeklyTable.tableName,
        MONTHLY_TABLE_NAME: monthlyTable.tableName,
      },
    });

    const batchHandler = new lambda.Function(this, `${PREFIX}-batch-handler`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('../back/batch'),
      handler: 'src/batchHandler.handler',
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        DATA_BUCKET_NAME: dataBucket.bucketName,
        DAILY_TABLE_NAME: dailyTable.tableName,
        WEEKLY_TABLE_NAME: weeklyTable.tableName,
        MONTHLY_TABLE_NAME: monthlyTable.tableName,
      },
    });

    dailyTable.grantReadWriteData(apiHandler);
    weeklyTable.grantReadWriteData(apiHandler);
    monthlyTable.grantReadWriteData(apiHandler);
    
    dailyTable.grantReadWriteData(batchHandler);
    weeklyTable.grantReadWriteData(batchHandler);
    monthlyTable.grantReadWriteData(batchHandler);
    
    dataBucket.grantReadWrite(batchHandler);

    const api = new apigateway.RestApi(this, `${PREFIX}-api`, {
      restApiName: `${PREFIX}-api`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const apiResource = api.root.addResource(API_PATH);
    const rankingResource = apiResource.addResource('ranking');
    rankingResource.addMethod('GET', new apigateway.LambdaIntegration(apiHandler));

    const rule = new events.Rule(this, `${PREFIX}-daily-rule`, {
      schedule: events.Schedule.cron({ minute: '0', hour: '16', day: '*', month: '*', year: '*' }),
    });
    rule.addTarget(new targets.LambdaFunction(batchHandler));

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
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    new cdk.CfnOutput(this, 'WebsiteURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Website URL',
    });

    const distPath = '../webapp/dist';
    new s3deploy.BucketDeployment(this, `${PREFIX}-webapp-deployment`, {
      sources: [s3deploy.Source.asset(distPath)],
      destinationBucket: webappBucket,
      distribution,
      distributionPaths: ['/*'],
    });
  }
}

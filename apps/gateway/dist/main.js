"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: false,
        forbidNonWhitelisted: false,
        transform: true,
    }));
    app.enableCors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'Accept',
            'X-Api-Key',
            'x-api-key',
        ],
    });
    const configService = app.get(config_1.ConfigService);
    const nodeEnv = configService.get('NODE_ENV', 'development');
    if (nodeEnv !== 'production') {
        const swaggerConfig = new swagger_1.DocumentBuilder()
            .setTitle('OmniSight Gateway API')
            .setDescription('OmniSight 全链路可观测性系统 — 数据接入网关 API 文档。' +
            '包含事件上报、错误查询、性能指标、录像回放、SourceMap 管理等接口。')
            .setVersion('1.0')
            .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
        swagger_1.SwaggerModule.setup('api-docs', app, document);
    }
    const port = configService.get('PORT', 3000);
    await app.listen(port);
    console.log(`[OmniSight Gateway] 服务已启动，监听端口: ${port}`);
    console.log(`[OmniSight Gateway] 环境: ${nodeEnv}`);
    if (nodeEnv !== 'production') {
        console.log(`[OmniSight Gateway] Swagger 文档: http://localhost:${port}/api-docs`);
    }
    const gracefulShutdown = async (signal) => {
        console.log(`[OmniSight Gateway] 收到 ${signal} 信号，开始优雅关闭...`);
        try {
            await app.close();
            console.log('[OmniSight Gateway] 服务已优雅关闭');
            process.exit(0);
        }
        catch (error) {
            console.error('[OmniSight Gateway] 优雅关闭失败:', error);
            process.exit(1);
        }
    };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
bootstrap();
//# sourceMappingURL=main.js.map
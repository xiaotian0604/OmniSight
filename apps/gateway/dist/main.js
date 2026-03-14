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
    app.enableCors();
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
}
bootstrap();
//# sourceMappingURL=main.js.map
/**
 * ===============================================================
 * OmniSight Gateway — 应用启动入口
 * ===============================================================
 *
 * 职责：
 * 1. 创建 NestJS 应用实例
 * 2. 配置全局 ValidationPipe（自动校验所有 DTO 请求体）
 * 3. 启用 CORS（允许 console 前端跨域调用）
 * 4. 挂载 Swagger API 文档（开发环境可通过 /api-docs 访问）
 * 5. 从环境变量读取端口号并启动 HTTP 监听
 *
 * 启动命令：
 *   开发模式：pnpm --filter @omnisight/gateway dev
 *   生产模式：node dist/main.js
 * ===============================================================
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  /**
   * 创建 NestJS 应用实例
   * AppModule 是根模块，包含所有子模块的导入
   */
  const app = await NestFactory.create(AppModule);

  /**
   * 全局 ValidationPipe 配置
   *
   * - whitelist: false — 不剥离 DTO 中未声明的属性
   *   原因：SDK 上报的事件是扁平结构，包含 type-specific 字段（如 apiUrl、duration、
   *   message、stack 等），这些字段因事件类型不同而不同，无法在单一 DTO 中穷举声明。
   *   如果开启 whitelist，这些字段会被剥离，导致 Worker 入库时丢失关键数据。
   *
   * - forbidNonWhitelisted: false — 不拒绝包含额外属性的请求
   *   原因同上，SDK 事件的字段是动态的，不能因为额外字段而返回 400。
   *
   * - transform: true — 自动将请求体的 plain object 转换为 DTO class 实例
   *   这样 class-validator 的装饰器才能对已声明的字段生效校验。
   *
   * 安全说明：
   *   虽然不剥离额外字段，但已声明的字段（type、appId、sessionId、ts）
   *   仍然会被 class-validator 严格校验。恶意数据通过 ApiKeyGuard 鉴权拦截。
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  /**
   * 启用 CORS（跨域资源共享）
   * 允许 apps/console 前端（默认运行在 localhost:5173）调用 gateway 接口
   * 生产环境应配置具体的 origin 白名单
   */
  app.enableCors();

  /**
   * Swagger API 文档配置
   * 仅在非生产环境启用，通过 /api-docs 路径访问
   * 方便开发调试和面试演示时展示所有接口
   */
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('OmniSight Gateway API')
      .setDescription(
        'OmniSight 全链路可观测性系统 — 数据接入网关 API 文档。' +
        '包含事件上报、错误查询、性能指标、录像回放、SourceMap 管理等接口。',
      )
      .setVersion('1.0')
      .addApiKey(
        { type: 'apiKey', name: 'x-api-key', in: 'header' },
        'api-key',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document);
  }

  /**
   * 从环境变量读取端口号，默认 3000
   * ConfigService 会自动读取 .env 文件和系统环境变量
   */
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  console.log(`[OmniSight Gateway] 服务已启动，监听端口: ${port}`);
  console.log(`[OmniSight Gateway] 环境: ${nodeEnv}`);
  if (nodeEnv !== 'production') {
    console.log(`[OmniSight Gateway] Swagger 文档: http://localhost:${port}/api-docs`);
  }
}

bootstrap();

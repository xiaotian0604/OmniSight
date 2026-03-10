/**
 * ===============================================================
 * OmniSight Gateway — 根模块（AppModule）
 * ===============================================================
 *
 * 职责：
 * 作为 NestJS 应用的根模块，负责组装所有子模块。
 * NestJS 的模块系统类似于 Angular，通过 @Module 装饰器声明模块的依赖关系。
 *
 * 导入的模块说明：
 *
 * 1. ConfigModule — 环境变量管理
 *    - isGlobal: true — 全局可用，所有模块都能注入 ConfigService
 *    - 自动读取项目根目录的 .env 文件
 *
 * 2. BullModule — Bull Queue 消息队列
 *    - 使用 forRootAsync 异步初始化，从 ConfigService 读取 Redis 连接地址
 *    - Bull 底层使用 Redis 作为消息中间件
 *    - 用于解耦事件上报（快速响应）和事件处理（异步消费）
 *
 * 3. DatabaseModule — 全局数据库连接
 *    - 提供 PG_POOL（PostgreSQL 连接池）和 REDIS（Redis 客户端）
 *    - 标记为 @Global()，无需在子模块中重复导入
 *
 * 4. AuthModule — 鉴权模块
 *    - 提供 ApiKeyGuard，用于校验 SDK 上报请求的 x-api-key
 *
 * 5. IngestModule — 事件上报模块
 *    - POST /v1/ingest/batch 接口
 *    - 接收 SDK 批量上报的事件数据，写入 Bull Queue
 *
 * 6. ReplayModule — 录像管理模块
 *    - POST /v1/replay — 上传 rrweb 录像
 *    - GET /v1/replay/:sessionId — 获取指定会话的录像
 *    - GET /v1/replay — 录像列表
 *
 * 7. QueryModule — 数据查询模块
 *    - 提供错误列表、错误详情、错误率趋势、API 耗时、Vitals 指标等查询接口
 *    - 供 apps/console 前端调用
 *
 * 8. SourcemapModule — SourceMap 管理模块
 *    - POST /v1/sourcemap — CI 上传 SourceMap 文件
 *    - GET /v1/sourcemap — 查询 SourceMap 记录
 *
 * 9. WorkerModule — 队列消费模块
 *    - Bull Queue Worker，异步消费上报的事件
 *    - 执行去重、富化、写入 PostgreSQL
 *
 * 10. HealthModule — 健康检查模块
 *     - GET /health — 检查 PG 和 Redis 连通性
 *     - 用于 Docker/K8s 探针和面试演示验证
 * ===============================================================
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { DatabaseModule } from './database.module';
import { AuthModule } from './auth/auth.module';
import { IngestModule } from './ingest/ingest.module';
import { ReplayModule } from './replay/replay.module';
import { QueryModule } from './query/query.module';
import { SourcemapModule } from './sourcemap/sourcemap.module';
import { WorkerModule } from './worker/worker.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    /**
     * ConfigModule — 环境变量管理
     * isGlobal: true 使 ConfigService 在所有模块中可直接注入
     * 自动加载 .env 文件中的变量到 process.env
     */
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    /**
     * BullModule — Bull Queue 根配置
     * forRootAsync 允许异步读取配置，注入 ConfigService 获取 Redis 地址
     *
     * Bull Queue 在本项目中的作用：
     * - SDK 上报事件 → Gateway 写入队列 → 立即返回 200（P99 < 50ms）
     * - Worker 异步消费队列 → 去重 → 富化 → 写入 PostgreSQL
     * 这种架构解耦了上报链路和处理链路，保证上报接口的低延迟
     */
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>(
          'REDIS_URL',
          'redis://localhost:6379',
        );
        const url = new URL(redisUrl);
        return {
          redis: {
            host: url.hostname,
            port: parseInt(url.port, 10) || 6379,
          },
        };
      },
      inject: [ConfigService],
    }),

    /**
     * 全局数据库模块 — 提供 PG_POOL 和 REDIS
     * 因为标记了 @Global()，这里导入一次后所有子模块都能使用
     */
    DatabaseModule,

    /** 鉴权模块 — 提供 ApiKeyGuard */
    AuthModule,

    /** 事件上报模块 — POST /v1/ingest/batch */
    IngestModule,

    /** 录像管理模块 — 录像的上传和查询 */
    ReplayModule,

    /** 数据查询模块 — 错误、指标、Vitals 查询接口 */
    QueryModule,

    /** SourceMap 管理模块 — SourceMap 上传和查询 */
    SourcemapModule,

    /** 队列消费模块 — Bull Queue Worker */
    WorkerModule,

    /** 健康检查模块 — GET /health */
    HealthModule,
  ],
})
export class AppModule {}

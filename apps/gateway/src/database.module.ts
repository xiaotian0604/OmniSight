/**
 * ===============================================================
 * OmniSight Gateway — 全局数据库模块
 * ===============================================================
 *
 * 职责：
 * 提供两个全局 Provider，供所有模块通过 @Inject() 注入使用：
 *
 * 1. PG_POOL — PostgreSQL 连接池（pg 库的 Pool 实例）
 *    - 所有数据库操作共享同一个连接池，避免各 Service 中 new Pool()
 *    - 连接池大小默认 20，适合单机开发和中等负载
 *    - 连接空闲 30 秒后自动释放，避免连接泄漏
 *
 * 2. REDIS — Redis 客户端（ioredis 实例）
 *    - 用于 API Key 缓存、事件去重、会话缓存等
 *    - ioredis 内置自动重连机制，无需手动处理断线
 *
 * 设计决策：
 * - 使用 @Global() 装饰器使模块全局可用，无需在每个子模块中重复导入
 * - 使用 useFactory 异步创建，确保可以注入 ConfigService 读取环境变量
 * - 应用关闭时（onApplicationShutdown）自动释放连接，防止资源泄漏
 *
 * 使用方式：
 *   @Inject('PG_POOL') private readonly pg: Pool
 *   @Inject('REDIS') private readonly redis: Redis
 * ===============================================================
 */

import { Module, Global, Inject, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import Redis from 'ioredis';

/**
 * PG_POOL 注入令牌
 * 在 NestJS 的依赖注入系统中，非 class 类型的 Provider 需要使用字符串令牌标识
 */
export const PG_POOL = 'PG_POOL';

/**
 * REDIS 注入令牌
 */
export const REDIS = 'REDIS';

@Global()
@Module({
  providers: [
    /**
     * PostgreSQL 连接池 Provider
     *
     * useFactory 工厂函数：
     * - 注入 ConfigService 读取 DATABASE_URL 环境变量
     * - 创建 pg.Pool 实例，配置连接池参数
     * - Pool 会自动管理连接的创建、复用和销毁
     *
     * 连接字符串格式：postgresql://user:password@host:port/database
     * 示例：postgresql://postgres:postgres@localhost:5432/omnisight
     */
    {
      provide: PG_POOL,
      useFactory: (configService: ConfigService): Pool => {
        const databaseUrl = configService.get<string>(
          'DATABASE_URL',
          'postgresql://postgres:postgres@localhost:5432/omnisight',
        );

        return new Pool({
          connectionString: databaseUrl,
          /* 最大连接数：开发环境 20 足够，生产环境可根据负载调整 */
          max: 20,
          /* 连接空闲超时（毫秒）：30 秒无活动则释放连接回池 */
          idleTimeoutMillis: 30000,
          /* 连接超时（毫秒）：5 秒内无法建立连接则报错 */
          connectionTimeoutMillis: 5000,
        });
      },
      inject: [ConfigService],
    },

    /**
     * Redis 客户端 Provider
     *
     * useFactory 工厂函数：
     * - 注入 ConfigService 读取 REDIS_URL 环境变量
     * - 创建 ioredis 实例
     * - ioredis 默认启用自动重连，断线后会指数退避重试
     *
     * 连接字符串格式：redis://host:port
     * 示例：redis://localhost:6379
     */
    {
      provide: REDIS,
      useFactory: (configService: ConfigService): Redis => {
        const redisUrl = configService.get<string>(
          'REDIS_URL',
          'redis://localhost:6379',
        );

        return new Redis(redisUrl, {
          /* 最大重试次数：连接断开后最多重试 10 次 */
          maxRetriesPerRequest: 10,
          /* 启用离线队列：连接断开期间的命令会缓存，重连后自动执行 */
          enableOfflineQueue: true,
        });
      },
      inject: [ConfigService],
    },
  ],
  /**
   * 导出 PG_POOL 和 REDIS，使其他模块可以通过 @Inject() 使用
   * 因为标记了 @Global()，所以无需在每个模块的 imports 中声明 DatabaseModule
   */
  exports: [PG_POOL, REDIS],
})
export class DatabaseModule implements OnApplicationShutdown {
  /**
   * 构造函数注入 PG_POOL 和 REDIS 实例
   * 用于在应用关闭时执行清理操作
   */
  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * 应用关闭时的生命周期钩子
   * NestJS 在收到 SIGTERM/SIGINT 信号时会自动调用此方法
   *
   * 职责：
   * 1. 关闭 PostgreSQL 连接池 — 释放所有数据库连接
   * 2. 断开 Redis 连接 — 优雅关闭 Redis 客户端
   *
   * 这样可以防止进程退出时连接泄漏，确保数据库服务端不会残留僵尸连接
   */
  async onApplicationShutdown(): Promise<void> {
    await this.pg.end();
    this.redis.disconnect();
  }
}

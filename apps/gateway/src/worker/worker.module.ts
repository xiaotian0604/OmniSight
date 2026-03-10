/**
 * ===============================================================
 * OmniSight Gateway — 队列消费模块
 * ===============================================================
 *
 * 职责：
 * 封装 Bull Queue Worker 相关的配置和 Provider。
 *
 * 模块组成：
 * - IngestWorker — @Processor('ingest') 装饰的 Worker
 *   异步消费 'ingest' 队列中的事件，执行去重、富化、写库
 *
 * 依赖关系：
 * - BullModule.registerQueue({ name: 'ingest' }) — 注册 Worker 要消费的队列
 *   队列名称 'ingest' 必须与 IngestModule 中注册的队列名称一致
 * - DatabaseModule（全局模块）— 提供 PG_POOL 和 REDIS
 *   Worker 需要 PG_POOL 写入数据库，REDIS 执行去重
 *
 * 架构说明：
 * Worker 和 IngestController 在同一个 NestJS 进程中运行。
 * 在生产环境中，如果需要独立扩展 Worker 的处理能力，
 * 可以将 WorkerModule 拆分为独立的 NestJS 应用，
 * 只要它们连接同一个 Redis 实例即可。
 * Bull Queue 天然支持多消费者模式。
 * ===============================================================
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { IngestWorker } from './ingest.worker';

@Module({
  imports: [
    /**
     * 注册 'ingest' 队列
     * Worker 需要通过 @Processor('ingest') 关联到这个队列
     * Bull 会自动从 Redis 中拉取 Job 并分发给 Worker 处理
     *
     * 注意：这里的 registerQueue 与 IngestModule 中的是同一个队列
     * Bull 内部通过队列名称（'ingest'）在 Redis 中查找，不会重复创建
     */
    BullModule.registerQueue({
      name: 'ingest',
    }),
  ],
  providers: [IngestWorker],
})
export class WorkerModule {}

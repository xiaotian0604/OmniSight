/**
 * ===============================================================
 * OmniSight Gateway — 事件上报模块
 * ===============================================================
 *
 * 职责：
 * 封装事件上报相关的 Controller、Service 和 Bull Queue 注册。
 *
 * 模块组成：
 * - IngestController — POST /v1/ingest/batch 接口
 * - IngestService — 将事件写入 Bull Queue
 * - BullModule.registerQueue({ name: 'ingest' }) — 注册名为 'ingest' 的队列
 *
 * 依赖关系：
 * - AuthModule — 提供 ApiKeyGuard（Controller 中使用 @UseGuards）
 * - BullModule（根模块已配置 forRoot）— 提供 Redis 连接
 *
 * 数据流：
 *   SDK → POST /v1/ingest/batch → IngestController → IngestService → Bull Queue
 *   → (异步) IngestWorker → PostgreSQL
 * ===============================================================
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AuthModule } from '../auth/auth.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

@Module({
  imports: [
    /**
     * 导入 AuthModule，使 ApiKeyGuard 可在 IngestController 中使用
     * ApiKeyGuard 通过 @UseGuards() 装饰器应用到具体接口
     */
    AuthModule,

    /**
     * 注册名为 'ingest' 的 Bull Queue
     * 这个队列名称需要与 Worker 中 @Processor('ingest') 保持一致
     * Bull 会在 Redis 中创建对应的队列数据结构（list + sorted set）
     */
    BullModule.registerQueue({
      name: 'ingest',
    }),
  ],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}

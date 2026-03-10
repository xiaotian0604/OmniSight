/**
 * ===============================================================
 * OmniSight Gateway — 事件上报 Service
 * ===============================================================
 *
 * 职责：
 * 将 SDK 上报的事件数据写入 Bull Queue（名为 'ingest' 的队列）。
 *
 * 为什么不直接写数据库？
 * - SDK 每 5 秒批量上报一次，高峰期可能有大量并发请求
 * - 如果同步写 PostgreSQL，数据库压力大，接口响应慢
 * - 使用 Bull Queue 解耦：Gateway 只负责接收和入队，立即返回 200
 * - Worker 异步消费队列，执行去重、富化、写库等耗时操作
 * - 这样 Gateway 的 P99 响应时间可以控制在 50ms 以内
 *
 * Bull Queue 底层使用 Redis 作为消息中间件：
 * - 消息持久化：即使 Worker 临时宕机，消息不会丢失
 * - 自动重试：处理失败的 Job 会按配置重试
 * - 并发控制：可以配置 Worker 的并发数
 * ===============================================================
 */

import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { IngestEventDto } from './ingest.dto';

@Injectable()
export class IngestService {
  constructor(
    /**
     * 注入名为 'ingest' 的 Bull Queue
     * @InjectQueue('ingest') 对应 IngestModule 中 BullModule.registerQueue({ name: 'ingest' })
     * Queue 类型来自 bull 库，提供 add/addBulk 等方法
     */
    @InjectQueue('ingest') private readonly ingestQueue: Queue,
  ) {}

  /**
   * 将一批事件写入 Bull Queue
   *
   * @param events - SDK 上报的事件数组（已通过 DTO 校验）
   *
   * 业务逻辑：
   * 1. 将整个事件数组作为一个 Job 的 data 写入队列
   *    - 一个 Job 对应一次 SDK 的批量上报（通常 1~20 个事件）
   *    - Worker 消费时会遍历 job.data 逐个处理
   *
   * 2. Job 配置说明：
   *    - removeOnComplete: true — 处理成功后自动删除 Job，避免 Redis 内存膨胀
   *    - removeOnFail: false — 处理失败的 Job 保留，方便排查问题
   *    - attempts: 3 — 最多重试 3 次（指数退避）
   *    - backoff: { type: 'exponential', delay: 2000 }
   *      第 1 次重试等 2 秒，第 2 次等 4 秒，第 3 次等 8 秒
   *
   * @returns 写入队列后的 Job 对象（包含 jobId，可用于追踪）
   */
  async enqueue(events: IngestEventDto[]) {
    const job = await this.ingestQueue.add(events, {
      /** 处理成功后自动从 Redis 中删除 Job 数据，节省内存 */
      removeOnComplete: true,
      /** 处理失败的 Job 保留在 Redis 中，方便通过 Bull Dashboard 排查 */
      removeOnFail: false,
      /** 最大重试次数：如果 Worker 处理失败（如数据库暂时不可用），最多重试 3 次 */
      attempts: 3,
      /** 重试策略：指数退避，基础延迟 2 秒 */
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    return job;
  }
}

/**
 * ===============================================================
 * OmniSight Gateway — 事件消费 Worker
 * ===============================================================
 *
 * 职责：
 * 异步消费 Bull Queue 中的事件数据，执行以下处理流程：
 * 1. 去重 — 使用 Redis SET 模拟布隆过滤器，过滤重复事件
 * 2. 富化 — 预留 UA 解析、IP 地理位置等数据增强（当前为占位实现）
 * 3. 写入 — 将处理后的事件批量写入 PostgreSQL events 超表
 *
 * 架构位置：
 * SDK → POST /v1/ingest/batch → IngestController → Bull Queue → [本 Worker] → PostgreSQL
 *
 * 为什么使用 Worker 异步处理？
 * - 解耦上报链路和处理链路，保证上报接口的低延迟（P99 < 50ms）
 * - Worker 可以执行耗时操作（去重查询、数据库写入）而不影响 SDK 端体验
 * - Bull Queue 提供消息持久化和自动重试，保证数据不丢失
 * - 可以通过调整 Worker 并发数来控制数据库写入压力
 *
 * 去重策略：
 * 使用 Redis SET 命令（带 EX 过期时间）模拟布隆过滤器：
 * - Key 格式：dedup:{appId}:{fingerprint}
 * - 如果 SET NX 返回 null（key 已存在），说明是重复事件，跳过
 * - 如果 SET NX 返回 OK（key 不存在），说明是新事件，继续处理
 * - TTL 设为 3600 秒（1 小时），1 小时后允许相同指纹的事件再次入库
 *
 * 为什么用 Redis SET 而不是真正的布隆过滤器？
 * - Redis 的 BF.ADD/BF.EXISTS 需要 RedisBloom 模块，增加部署复杂度
 * - SET NX + EX 实现简单，功能等价，且支持自动过期
 * - 对于当前规模（简历级项目），SET 的内存开销完全可接受
 * - 面试时可以说"用 Redis SET 模拟布隆过滤器"，并解释为什么这样做
 * ===============================================================
 */

import { Processor, Process } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { PG_POOL, REDIS } from '../database.module';

/**
 * Redis 去重 key 前缀
 * 完整 key 格式：dedup:{appId}:{fingerprint}
 */
const DEDUP_PREFIX = 'dedup:';

/**
 * 去重 key 的过期时间（秒）
 * 1 小时 = 3600 秒
 * 1 小时内相同 appId + fingerprint 的事件只会入库一次
 */
const DEDUP_TTL_SECONDS = 3600;

@Processor('ingest')
export class IngestWorker {
  /**
   * NestJS 内置 Logger
   * 用于记录 Worker 处理过程中的日志，方便排查问题
   */
  private readonly logger = new Logger(IngestWorker.name);

  constructor(
    /**
     * 注入 PostgreSQL 连接池
     * 用于将处理后的事件写入 events 超表
     */
    @Inject(PG_POOL) private readonly pg: Pool,

    /**
     * 注入 Redis 客户端
     * 用于事件去重（SET NX + EX 模拟布隆过滤器）
     */
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Bull Queue 的 Job 处理方法
   * @Process() 装饰器标记此方法为默认的 Job 处理器
   * 当队列中有新 Job 时，Bull 会自动调用此方法
   *
   * @param job - Bull Job 对象
   *   job.data 是 IngestService.enqueue() 写入的事件数组
   *   job.id 是 Bull 自动生成的 Job ID
   *   job.attemptsMade 是当前重试次数（从 0 开始）
   *
   * 处理流程：
   * 1. 遍历 job.data 中的每个事件
   * 2. 对有 fingerprint 的事件执行去重检查
   * 3. 未被去重的事件执行富化处理
   * 4. 将处理后的事件写入 PostgreSQL
   *
   * 错误处理：
   * - 如果处理过程中抛出异常，Bull 会根据 Job 配置自动重试
   * - 重试策略：指数退避，最多 3 次（在 IngestService 中配置）
   * - 所有重试都失败后，Job 进入 failed 状态，保留在 Redis 中供排查
   */
  @Process()
  async handleIngestJob(job: Job<any[]>) {
    this.logger.log(
      `开始处理 Job #${job.id}，包含 ${job.data.length} 个事件`,
    );

    /** 统计处理结果，用于日志输出 */
    let insertedCount = 0;
    let dedupCount = 0;

    for (const event of job.data) {
      /**
       * 步骤 1：去重检查
       *
       * 只对有 fingerprint 的事件进行去重（主要是 error 类型）
       * api/vital/resource 等类型通常没有 fingerprint，直接入库
       *
       * Redis SET 命令参数说明：
       * - NX: 仅当 key 不存在时才设置（Not eXists）
       * - EX: 设置过期时间（秒）
       * - 返回值：成功设置返回 'OK'，key 已存在返回 null
       */
      if (event.fingerprint) {
        const dedupKey = `${DEDUP_PREFIX}${event.appId}:${event.fingerprint}`;
        const setResult = await this.redis.set(
          dedupKey,
          '1',
          'EX',
          DEDUP_TTL_SECONDS,
          'NX',
        );

        if (setResult === null) {
          /**
           * key 已存在，说明 1 小时内已有相同指纹的事件入库
           * 跳过此事件，避免重复数据
           */
          dedupCount++;
          continue;
        }
      }

      /**
       * 步骤 2：数据富化
       * 预留的数据增强处理，当前为占位实现
       * 未来可以在这里添加：
       * - UA 解析（解析浏览器名称、版本、操作系统）
       * - IP 地理位置解析（解析国家、城市）
       * - 数据标准化（统一时间格式、字段名等）
       */
      const enrichedEvent = this.enrich(event);

      /**
       * 步骤 3：写入 PostgreSQL events 超表
       *
       * 字段映射说明：
       * - id: 由数据库自动生成（gen_random_uuid()）
       * - app_id: 项目标识
       * - session_id: 用户会话 ID
       * - type: 事件类型（error/api/vital/...）
       * - ts: 客户端时间戳，转换为 PostgreSQL 的 timestamptz 类型
       *   SDK 传来的是毫秒级 Unix 时间戳，使用 to_timestamp($4 / 1000.0) 转换
       * - fingerprint: 错误去重指纹（可能为 null）
       * - payload: 完整事件数据，以 JSONB 格式存储
       * - url: 事件发生时的页面 URL
       * - ua: User-Agent
       * - country/city: 地理位置信息（当前为 null，由富化步骤填充）
       */
      await this.pg.query(
        `INSERT INTO events (app_id, session_id, type, ts, fingerprint, payload, url, ua, country, city)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5, $6, $7, $8, $9, $10)`,
        [
          enrichedEvent.appId,
          enrichedEvent.sessionId,
          enrichedEvent.type,
          enrichedEvent.ts,
          enrichedEvent.fingerprint || null,
          JSON.stringify(enrichedEvent.payload || enrichedEvent),
          enrichedEvent.url || null,
          enrichedEvent.ua || null,
          enrichedEvent.country || null,
          enrichedEvent.city || null,
        ],
      );

      insertedCount++;
    }

    this.logger.log(
      `Job #${job.id} 处理完成：写入 ${insertedCount} 条，去重跳过 ${dedupCount} 条`,
    );
  }

  /**
   * 数据富化方法（预留占位）
   *
   * 当前实现：直接返回原始事件，不做任何修改
   *
   * 未来可扩展的富化逻辑：
   * 1. UA 解析 — 使用 ua-parser-js 库解析 User-Agent 字符串
   *    提取浏览器名称、版本、操作系统等信息
   *    示例：'Chrome 120.0.0 / macOS 14.2'
   *
   * 2. IP 地理位置 — 使用 MaxMind GeoIP2 数据库
   *    根据客户端 IP 解析国家和城市
   *    需要在 Gateway 层传递客户端 IP 到 Worker
   *
   * 3. 数据标准化 — 统一字段格式
   *    如将不同 SDK 版本的字段名映射为统一格式
   *
   * @param event - 原始事件数据
   * @returns 富化后的事件数据
   */
  private enrich(event: any): any {
    /**
     * TODO: 实现 UA 解析
     * const uaResult = uaParser(event.ua);
     * event.browser = uaResult.browser.name;
     * event.browserVersion = uaResult.browser.version;
     * event.os = uaResult.os.name;
     */

    /**
     * TODO: 实现 IP 地理位置解析
     * const geo = geoip.lookup(event.clientIp);
     * event.country = geo?.country;
     * event.city = geo?.city;
     */

    return event;
  }
}

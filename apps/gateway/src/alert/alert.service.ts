/**
 * ===============================================================
 * OmniSight Gateway — 告警核心服务
 * ===============================================================
 *
 * 本文件职责：
 * 1. 扫描高频错误 — 查询 PostgreSQL 统计错误频率
 * 2. 控频机制 — 使用 Redis 记录已发送告警，避免重复告警
 * 3. 发送告警 — 调用各告警渠道发送消息
 * 4. 日志记录 — 记录告警发送状态
 *
 * 架构位置：
 * AlertWorker (定时触发)
 *   ↓
 * AlertService.scanAndAlert()
 *   ↓
 * PostgreSQL (查询高频错误) + Redis (控频检查)
 *   ↓
 * AlertChannel.send() (飞书/钉钉等)
 *
 * 控频机制原理：
 * 使用 Redis SET 命令存储告警记录：
 * - Key: alert:sent:{appId}:{fingerprint}
 * - Value: 告警时间戳
 * - TTL: 冷却时间（如 30 分钟）
 *
 * 检查逻辑：
 * 1. 尝试 SET key value EX ttl NX
 * 2. 如果返回 OK，说明冷却期已过，可以发送告警
 * 3. 如果返回 null，说明 key 存在，仍在冷却期内，跳过
 *
 * 为什么用 Redis 而不是内存变量？
 * - 多实例部署：多个 Gateway 实例共享同一个 Redis
 * - 持久化：重启后告警记录不丢失
 * - 自动过期：Redis TTL 自动清理过期 key
 *
 * 面试要点：
 * - Redis SET NX EX 是原子操作，保证并发安全
 * - 冷却期设计避免告警轰炸，提升告警的有效性
 * - 时间窗口聚合避免频繁查询数据库
 * ===============================================================
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { PG_POOL, REDIS } from '../database.module';
import {
  AlertPayload,
  AlertResult,
  AlertRuleConfig,
  AlertLevel,
  HighFrequencyError,
  HighFrequencyErrorScanResult,
} from './types/alert.types';
import { AlertChannel } from './channels/channel.interface';
import { SourcemapService } from '../sourcemap/sourcemap.service';

/**
 * Redis 告警记录 key 前缀
 * 完整 key 格式：alert:sent:{appId}:{fingerprint}
 */
const ALERT_SENT_PREFIX = 'alert:sent:';
const ERROR_OCCURRENCES_SQL = `
CASE
  WHEN COALESCE(payload->>'occurrences', '') ~ '^[0-9]+$'
    THEN GREATEST((payload->>'occurrences')::int, 1)
  ELSE 1
END`;
const AFFECTED_AUDIENCE_SQL =
  `COUNT(DISTINCT COALESCE(NULLIF(payload->>'userId', ''), session_id::text))`;

/**
 * 告警核心服务
 *
 * 使用 @Injectable() 装饰器标记为 NestJS Provider。
 * 通过构造函数注入依赖：
 * - PG_POOL: PostgreSQL 连接池
 * - REDIS: Redis 客户端
 * - ConfigService: 配置服务
 * - AlertChannel[]: 所有告警渠道（多例注入）
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  /**
   * 告警规则配置
   * 从环境变量读取，包含阈值、时间窗口、冷却时间。
   */
  private readonly ruleConfig: AlertRuleConfig;

  /**
   * 是否启用告警功能
   * 通过环境变量 ALERT_ENABLED 控制。
   */
  private readonly alertEnabled: boolean;

  constructor(
    @Inject(PG_POOL) private readonly pg: Pool,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly sourcemapService: SourcemapService,
  ) {
    this.ruleConfig = {
      threshold: this.configService.get<number>('ALERT_THRESHOLD', 100),
      windowMinutes: this.configService.get<number>('ALERT_WINDOW_MINUTES', 5),
      cooldownMinutes: this.configService.get<number>(
        'ALERT_COOLDOWN_MINUTES',
        30,
      ),
    };

    this.alertEnabled = this.configService.get<string>(
      'ALERT_ENABLED',
      'false',
    ).toLowerCase() === 'true';

    this.logger.log(
      `告警服务初始化: enabled=${this.alertEnabled}, ` +
        `threshold=${this.ruleConfig.threshold}, ` +
        `window=${this.ruleConfig.windowMinutes}min, ` +
        `cooldown=${this.ruleConfig.cooldownMinutes}min`,
    );
  }

  /**
   * 扫描高频错误并发送告警
   *
   * 这是告警模块的主入口方法，由 AlertWorker 定时调用。
   *
   * 执行流程：
   * 1. 检查告警是否启用
   * 2. 查询 PostgreSQL 获取高频错误列表
   * 3. 遍历每个高频错误：
   *    a. 检查是否在冷却期内
   *    b. 构建告警内容
   *    c. 调用各渠道发送告警
   *    d. 记录发送结果
   *
   * @param channels - 告警渠道列表（由 AlertModule 注入）
   * @returns 扫描结果和发送统计
   */
  async scanAndAlert(channels: AlertChannel[]): Promise<{
    scanResult: HighFrequencyErrorScanResult | null;
    sentCount: number;
    skippedCount: number;
    failedCount: number;
  }> {
    if (!this.alertEnabled) {
      this.logger.debug('告警功能未启用，跳过扫描');
      return { scanResult: null, sentCount: 0, skippedCount: 0, failedCount: 0 };
    }

    const availableChannels = channels.filter((c) => c.isAvailable());
    if (availableChannels.length === 0) {
      this.logger.warn('没有可用的告警渠道，跳过扫描');
      return { scanResult: null, sentCount: 0, skippedCount: 0, failedCount: 0 };
    }

    this.logger.log('开始扫描高频错误...');

    const scanResult = await this.scanHighFrequencyErrors();

    if (scanResult.errors.length === 0) {
      this.logger.log('未检测到高频错误');
      return { scanResult, sentCount: 0, skippedCount: 0, failedCount: 0 };
    }

    this.logger.log(
      `检测到 ${scanResult.errors.length} 个高频错误，开始处理...`,
    );

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const error of scanResult.errors) {
      const canSend = await this.checkCooldown(error.appId, error.fingerprint);

      if (!canSend) {
        this.logger.debug(
          `错误 ${error.fingerprint} 在冷却期内，跳过告警`,
        );
        skippedCount++;
        continue;
      }

      const payload = await this.buildAlertPayload(error, scanResult);
      const results = await this.sendToChannels(payload, availableChannels);
      const hasSuccess = results.some((result) => result.success);

      if (!hasSuccess) {
        /**
         * checkCooldown() 先用 SET NX EX 预占了冷却位。
         * 如果所有渠道都失败，这次告警实际上没有送达，不应该进入冷却期，
         * 否则后续扫描会被错误地跳过。
         */
        await this.releaseCooldown(error.appId, error.fingerprint);
        failedCount++;
        continue;
      }

      await this.recordAlertSent(error.appId, error.fingerprint);

      sentCount++;
    }

    this.logger.log(
      `告警处理完成: 发送 ${sentCount} 条，失败 ${failedCount} 条，跳过 ${skippedCount} 条`,
    );

    return { scanResult, sentCount, skippedCount, failedCount };
  }

  /**
   * 扫描高频错误
   *
   * 从 PostgreSQL 查询在指定时间窗口内错误次数超过阈值的错误。
   *
   * SQL 查询逻辑：
   * 1. 筛选 type='error' 的事件
   * 2. 按时间窗口过滤（最近 N 分钟）
   * 3. 按 fingerprint 分组
   * 4. 统计每组的次数和影响用户数
   * 5. 筛选次数超过阈值的组
   * 6. 按次数降序排列
   *
   * 为什么用 PostgreSQL 而不是 Redis？
   * - 需要复杂聚合查询（COUNT、GROUP BY）
   * - 需要精确统计（Redis 是估算）
   * - 数据已经在 PostgreSQL 中，无需额外存储
   *
   * @returns 高频错误扫描结果
   */
  async scanHighFrequencyErrors(): Promise<HighFrequencyErrorScanResult> {
    const windowEnd = new Date();
    const windowStart = new Date(
      windowEnd.getTime() - this.ruleConfig.windowMinutes * 60 * 1000,
    );

    const query = `
      SELECT
        app_id AS app_id,
        fingerprint,
        (ARRAY_AGG(payload->>'message' ORDER BY ts DESC))[1] AS message,
        (ARRAY_AGG(payload->>'release' ORDER BY ts DESC))[1] AS release,
        (ARRAY_AGG(payload->>'filename' ORDER BY ts DESC))[1] AS filename,
        (ARRAY_AGG(payload->>'lineno' ORDER BY ts DESC))[1] AS lineno,
        (ARRAY_AGG(payload->>'colno' ORDER BY ts DESC))[1] AS colno,
        SUM(${ERROR_OCCURRENCES_SQL}) AS count,
        ${AFFECTED_AUDIENCE_SQL} AS affected_users,
        MIN(ts) AS first_seen,
        MAX(ts) AS last_seen
      FROM events
      WHERE type = 'error'
        AND fingerprint IS NOT NULL
        AND ts >= $1
        AND ts <= $2
      GROUP BY app_id, fingerprint
      HAVING SUM(${ERROR_OCCURRENCES_SQL}) >= $3
      ORDER BY count DESC
      LIMIT 50
    `;

    const result = await this.pg.query(query, [
      windowStart,
      windowEnd,
      this.ruleConfig.threshold,
    ]);

    const errors: HighFrequencyError[] = result.rows.map((row) => ({
      appId: row.app_id,
      fingerprint: row.fingerprint,
      message: row.message || 'Unknown error',
      release: row.release || undefined,
      filename: row.filename,
      lineno: this.parseOptionalNumber(row.lineno),
      colno: this.parseOptionalNumber(row.colno),
      count: parseInt(row.count, 10),
      affectedUsers: parseInt(row.affected_users, 10),
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
    }));

    return {
      errors,
      scannedAt: new Date(),
      windowStart,
      windowEnd,
    };
  }

  /**
   * 检查是否在冷却期内
   *
   * 使用 Redis SET NX EX 命令实现原子性的冷却期检查。
   *
   * 原理：
   * - SET key value EX ttl NX
   * - NX: 仅当 key 不存在时才设置
   * - EX: 设置过期时间（秒）
   * - 返回 OK: 设置成功，key 不存在，可以发送告警
   * - 返回 null: key 已存在，仍在冷却期内
   *
   * 为什么是原子操作？
   * - SET NX EX 是单个 Redis 命令
   * - 不会被其他命令打断
   * - 保证并发安全（多个 Worker 同时检查）
   *
   * @param appId - 应用 ID
   * @param fingerprint - 错误指纹
   * @returns true 表示可以发送告警，false 表示在冷却期内
   */
  private async checkCooldown(
    appId: string,
    fingerprint: string,
  ): Promise<boolean> {
    const key = `${ALERT_SENT_PREFIX}${appId}:${fingerprint}`;

    const result = await this.redis.set(
      key,
      Date.now().toString(),
      'EX',
      this.ruleConfig.cooldownMinutes * 60,
      'NX',
    );

    return result === 'OK';
  }

  /**
   * 记录告警已发送
   *
   * 在发送告警后调用，更新 Redis 中的告警记录。
   * 实际上 checkCooldown 已经设置了 key，这里只是语义上的补充。
   *
   * @param appId - 应用 ID
   * @param fingerprint - 错误指纹
   */
  private async recordAlertSent(appId: string, fingerprint: string): Promise<void> {
    const key = `${ALERT_SENT_PREFIX}${appId}:${fingerprint}`;
    await this.redis.expire(key, this.ruleConfig.cooldownMinutes * 60);
  }

  /**
   * 释放冷却位
   *
   * 当所有告警渠道都发送失败时，需要撤销 checkCooldown() 预占的 key，
   * 否则下一轮扫描会误以为该错误已经成功告警过。
   *
   * @param appId - 应用 ID
   * @param fingerprint - 错误指纹
   */
  private async releaseCooldown(appId: string, fingerprint: string): Promise<void> {
    const key = `${ALERT_SENT_PREFIX}${appId}:${fingerprint}`;
    await this.redis.del(key);
  }

  /**
   * 构建告警内容
   *
   * 将高频错误信息转换为告警消息格式。
   *
   * @param error - 高频错误信息
   * @param scanResult - 扫描结果（包含时间窗口）
   * @returns 告警内容
   */
  private async buildAlertPayload(
    error: HighFrequencyError,
    scanResult: HighFrequencyErrorScanResult,
  ): Promise<AlertPayload> {
    const resolvedSource = await this.sourcemapService.resolveLocation({
      appId: error.appId,
      release: error.release,
      filename: error.filename,
      lineno: error.lineno,
      colno: error.colno,
    });

    return {
      appId: error.appId,
      fingerprint: error.fingerprint,
      message: error.message,
      filename: error.filename,
      lineno: error.lineno,
      colno: error.colno,
      release: error.release || resolvedSource?.release,
      count: error.count,
      affectedUsers: error.affectedUsers,
      windowStart: scanResult.windowStart,
      windowEnd: scanResult.windowEnd,
      firstSeen: error.firstSeen,
      lastSeen: error.lastSeen,
      level: AlertLevel.ERROR,
      gitCommit: resolvedSource?.gitCommit,
      gitAuthor: resolvedSource?.gitAuthor,
      gitMessage: resolvedSource?.gitMessage,
      gitBranch: resolvedSource?.gitBranch,
      resolvedFile: resolvedSource?.originalFile,
      resolvedLine: resolvedSource?.originalLine,
      resolvedColumn: resolvedSource?.originalColumn,
      sourceContext: resolvedSource?.sourceContext,
    };
  }

  /**
   * 发送告警到所有渠道
   *
   * 遍历所有可用的告警渠道，调用 send() 方法发送消息。
   * 每个渠道独立发送，一个渠道失败不影响其他渠道。
   *
   * 并发 vs 串行？
   * - 当前实现：并发发送（Promise.all）
   * - 优点：发送速度快
   * - 缺点：如果某个渠道阻塞，可能影响其他渠道
   * - 实际场景：告警渠道通常响应很快，并发是合理的选择
   *
   * @param payload - 告警内容
   * @param channels - 告警渠道列表
   */
  private async sendToChannels(
    payload: AlertPayload,
    channels: AlertChannel[],
  ): Promise<AlertResult[]> {
    const results = await Promise.all(
      channels.map((channel) => channel.send(payload)),
    );

    results.forEach((result, index) => {
      if (result.success) {
        this.logger.log(
          `告警发送成功: channel=${channels[index].getType()}, fingerprint=${payload.fingerprint}`,
        );
      } else {
        this.logger.error(
          `告警发送失败: channel=${channels[index].getType()}, error=${result.error}`,
        );
      }
    });

    return results;
  }

  /**
   * 手动触发告警（用于测试）
   *
   * 提供一个手动触发告警的接口，方便测试告警功能。
   *
   * @param payload - 告警内容
   * @param channels - 告警渠道列表
   * @returns 发送结果
   */
  async triggerAlert(
    payload: AlertPayload,
    channels: AlertChannel[],
  ): Promise<AlertResult[]> {
    this.logger.log(`手动触发告警: fingerprint=${payload.fingerprint}`);
    return this.sendToChannels(payload, channels);
  }

  private parseOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return undefined;
  }
}

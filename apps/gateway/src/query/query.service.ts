/**
 * ===============================================================
 * OmniSight Gateway — 数据查询 Service
 * ===============================================================
 *
 * 职责：
 * 提供 console 前端所需的各种数据查询能力，包括：
 * - 错误率时序趋势（概览仪表盘的折线图）
 * - 错误聚合列表（按指纹分组，显示频次和影响用户数）
 * - 错误详情（单个错误的完整信息）
 * - API 接口耗时指标（P50/P99）
 * - Web Vitals 性能指标时序数据
 *
 * 数据来源：
 * 所有数据都存储在 PostgreSQL 的 events 超表中（TimescaleDB）
 * 不同类型的事件通过 type 字段区分：error / api / vital / resource / behavior
 *
 * TimescaleDB 特性使用：
 * - time_bucket() 函数：按时间桶聚合数据（如每 5 分钟一个点）
 *   这是 TimescaleDB 的核心函数，比 PostgreSQL 原生的 date_trunc 更灵活
 * - 如果 TimescaleDB 扩展未安装，会自动降级到 date_trunc
 *
 * 性能考虑：
 * - 所有查询都带有 app_id 和时间范围过滤，命中索引 idx_events_app_type
 * - 聚合查询使用 LIMIT 限制返回量，避免全表扫描
 * ===============================================================
 */

import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database.module';

@Injectable()
export class QueryService {
  constructor(
    /**
     * 注入 PostgreSQL 连接池
     * 所有查询通过连接池执行，自动管理连接的获取和释放
     */
    @Inject(PG_POOL) private readonly pg: Pool,
  ) {}

  /**
   * 获取错误率时序数据
   *
   * 业务场景：
   * console 概览仪表盘的"错误率趋势图"（ECharts 折线图）。
   * X 轴是时间，Y 轴是错误率（错误事件数 / 总事件数 * 100）。
   *
   * 实现细节：
   * 1. 优先使用 TimescaleDB 的 time_bucket() 函数按时间桶聚合
   *    - time_bucket('5 minutes', ts) 将时间戳对齐到 5 分钟的整数倍
   *    - 比 date_trunc 更灵活，支持任意间隔（如 15 分钟、1 小时）
   * 2. 如果 time_bucket 不可用（TimescaleDB 扩展未安装），降级到 date_trunc
   *    - catch 块中检查错误消息是否包含 'time_bucket'
   *    - 只有确认是 time_bucket 不存在的错误才降级，其他错误继续抛出
   * 3. COUNT(*) FILTER (WHERE type = 'error') — 使用 FILTER 子句统计错误事件
   *    这是 PostgreSQL 的标准语法，比 CASE WHEN 更简洁高效
   *
   * @param appId - 项目标识
   * @param from - 起始时间（ISO 8601 格式字符串）
   * @param to - 结束时间（ISO 8601 格式字符串）
   * @param interval - 时间桶间隔，默认 '5 minutes'
   *
   * @returns 时序数据数组，每个元素包含：
   *   - bucket: 时间桶的起始时间
   *   - error_count: 该时间桶内的错误事件数
   *   - total_count: 该时间桶内的总事件数
   *   - error_rate: 错误率（百分比，保留两位小数）
   */
  async getErrorRateSeries(
    appId: string,
    from: string,
    to: string,
    interval: string = '5 minutes',
  ) {
    /**
     * 优先尝试使用 TimescaleDB 的 time_bucket 函数
     * time_bucket 是 TimescaleDB 的核心聚合函数，性能优于 date_trunc
     */
    try {
      const result = await this.pg.query(
        `SELECT
           time_bucket($4::interval, ts) AS bucket,
           COUNT(*) FILTER (WHERE type = 'error') AS error_count,
           COUNT(*) AS total_count,
           ROUND(
             COUNT(*) FILTER (WHERE type = 'error')::numeric / GREATEST(COUNT(*), 1) * 100, 2
           ) AS error_rate
         FROM events
         WHERE app_id = $1
           AND ts >= $2::timestamptz
           AND ts <= $3::timestamptz
         GROUP BY bucket
         ORDER BY bucket`,
        [appId, from, to, interval],
      );

      return result.rows;
    } catch (err: any) {
      /**
       * 降级处理：如果错误是因为 time_bucket 函数不存在
       * （即 TimescaleDB 扩展未安装），则使用 PostgreSQL 原生的 date_trunc
       *
       * 只捕获 time_bucket 相关的错误，其他数据库错误继续向上抛出
       * 这样可以避免吞掉真正的 SQL 语法错误或连接问题
       */
      if (
        err.message &&
        err.message.includes('time_bucket') &&
        err.message.includes('does not exist')
      ) {
        /**
         * 降级：将 interval 字符串映射到 date_trunc 精度
         * time_bucket 支持任意间隔（如 '5 minutes'），
         * 但 date_trunc 只支持固定精度（minute/hour/day 等）
         */
        const truncPrecision = this.intervalToTruncPrecision(interval);
        const result = await this.pg.query(
          `SELECT
             date_trunc($4, ts) AS bucket,
             COUNT(*) FILTER (WHERE type = 'error') AS error_count,
             COUNT(*) AS total_count,
             ROUND(
               COUNT(*) FILTER (WHERE type = 'error')::numeric / GREATEST(COUNT(*), 1) * 100, 2
             ) AS error_rate
           FROM events
           WHERE app_id = $1
             AND ts >= $2::timestamptz
             AND ts <= $3::timestamptz
           GROUP BY bucket
           ORDER BY bucket`,
          [appId, from, to, truncPrecision],
        );

        return result.rows;
      }

      throw err;
    }
  }

  /**
   * 将 interval 字符串映射到 date_trunc 的精度参数
   * 用于 TimescaleDB 不可用时的降级处理
   */
  private intervalToTruncPrecision(interval: string): string {
    const lower = interval.toLowerCase();
    if (lower.includes('minute')) return 'minute';
    if (lower.includes('hour')) return 'hour';
    if (lower.includes('day')) return 'day';
    return 'hour';
  }

  /**
   * 获取错误聚合列表（按指纹分组）
   *
   * 业务场景：
   * console 的错误列表页。将相同指纹的错误聚合在一起，显示：
   * - 错误消息
   * - 发生次数
   * - 影响用户数（不同 session_id 的数量）
   * - 首次出现时间 / 最近出现时间
   * - 来源文件名
   *
   * 聚合逻辑：
   * - GROUP BY fingerprint — 相同指纹的错误归为一组
   * - fingerprint 由 SDK 端根据 error.message + stack 第一帧计算
   * - COUNT(DISTINCT session_id) — 统计受影响的不同用户会话数
   *
   * @param appId - 项目标识
   * @param from - 起始时间
   * @param to - 结束时间
   * @param limit - 返回数量限制，默认 50
   *
   * @returns 错误聚合数组，按发生次数降序排列
   */
  async getErrorsGrouped(
    appId: string,
    from: string,
    to: string,
    limit: number = 50,
  ) {
    const result = await this.pg.query(
      `SELECT
         fingerprint,
         payload->>'message' AS message,
         payload->>'filename' AS filename,
         COUNT(*)              AS count,
         COUNT(DISTINCT session_id) AS affected_users,
         MAX(ts)               AS last_seen,
         MIN(ts)               AS first_seen
       FROM events
       WHERE app_id = $1
         AND type = 'error'
         AND ts >= $2::timestamptz
         AND ts <= $3::timestamptz
       GROUP BY fingerprint, payload->>'message', payload->>'filename'
       ORDER BY count DESC
       LIMIT $4`,
      [appId, from, to, limit],
    );

    return result.rows;
  }

  /**
   * 获取单个错误的详细信息
   *
   * 业务场景：
   * console 的错误详情页。展示错误的完整信息，包括：
   * - 错误消息和堆栈
   * - 发生时的页面 URL 和 User-Agent
   * - 完整的 payload（包含 filename, lineno, colno 等）
   * - 会话 ID（可跳转到关联的录像回放）
   *
   * @param eventId - 事件 ID（UUID）
   *
   * @returns 单个事件的完整记录，如果不存在返回 null
   */
  async getErrorById(eventId: string) {
    const result = await this.pg.query(
      'SELECT * FROM events WHERE id = $1 AND type = $2 LIMIT 1',
      [eventId, 'error'],
    );

    return result.rows[0] || null;
  }

  /**
   * 获取 API 接口耗时指标
   *
   * 业务场景：
   * console 的性能分析页"接口耗时排行"表格。展示各接口的：
   * - P50 耗时（中位数，50% 的请求在此时间内完成）
   * - P99 耗时（99 分位数，99% 的请求在此时间内完成）
   * - 请求总数
   *
   * 实现细节：
   * - 使用 PostgreSQL 的 percentile_cont() 聚合函数计算分位数
   * - payload->>'duration' 是字符串类型，需要 ::float 转换为浮点数
   * - 使用 || 0 而非 ?? 0 处理空值：
   *   SQL 中没有 ?? 运算符，|| 0 的含义是：
   *   如果 duration 为 NULL，(NULL)::float 会变成 NULL，
   *   COALESCE 或 || 可以处理，但这里 percentile_cont 会自动忽略 NULL
   *   所以用 COALESCE((payload->>'duration')::float, 0) 确保安全
   *
   * @param appId - 项目标识
   * @param from - 起始时间
   * @param to - 结束时间
   * @param limit - 返回数量限制，默认 20
   *
   * @returns API 指标数组，按 P99 耗时降序排列
   */
  async getApiMetrics(
    appId: string,
    from: string,
    to: string,
    limit: number = 20,
  ) {
    const result = await this.pg.query(
      `SELECT
         payload->>'apiUrl' AS endpoint,
         payload->>'method' AS method,
         percentile_cont(0.50) WITHIN GROUP (
           ORDER BY COALESCE((payload->>'duration')::float, 0)
         ) AS p50,
         percentile_cont(0.75) WITHIN GROUP (
           ORDER BY COALESCE((payload->>'duration')::float, 0)
         ) AS p75,
         percentile_cont(0.99) WITHIN GROUP (
           ORDER BY COALESCE((payload->>'duration')::float, 0)
         ) AS p99,
         COUNT(*) AS count,
         ROUND(
           COUNT(*) FILTER (
             WHERE COALESCE((payload->>'status')::int, 0) >= 400
           )::numeric / GREATEST(COUNT(*), 1) * 100, 1
         ) AS "errorRate"
       FROM events
       WHERE app_id = $1
         AND type = 'api'
         AND ts >= $2::timestamptz
         AND ts <= $3::timestamptz
       GROUP BY payload->>'apiUrl', payload->>'method'
       ORDER BY p99 DESC
       LIMIT $4`,
      [appId, from, to, limit],
    );

    return result.rows;
  }

  /**
   * 获取 Web Vitals 性能指标时序数据
   *
   * 业务场景：
   * console 的性能分析页"Vitals 趋势图"。展示 LCP/CLS/TTFB/FID/INP 随时间的变化。
   * 前端使用 ECharts 渲染折线图，支持按指标名称筛选。
   *
   * 实现细节：
   * - 使用 events 表的 ts 列（而非 payload 中的 ts）作为时间维度
   *   原因：events.ts 是 TimescaleDB 超表的分区键，查询性能更好
   *   payload 中的 ts 是客户端时间戳，可能有时钟偏差
   * - AVG(value) 计算每个时间桶内的平均值
   *   对于 LCP/TTFB 等延迟指标，平均值能反映整体趋势
   *   对于 CLS 等累积指标，平均值同样有参考意义
   * - 按 name 分组，前端可以在同一张图上展示多条指标曲线
   *
   * @param appId - 项目标识
   * @param from - 起始时间
   * @param to - 结束时间
   * @param name - 可选，指标名称筛选（如 'LCP'），不传则返回所有指标
   * @param interval - 时间桶间隔，默认 '1 hour'
   *
   * @returns Vitals 时序数据数组
   */
  async getVitalsSeries(
    appId: string,
    from: string,
    to: string,
    name?: string,
    interval: string = '1 hour',
  ) {
    /**
     * 构建动态 WHERE 条件
     * 如果指定了 name 参数，增加 payload->>'name' 的过滤条件
     */
    const params: any[] = [appId, from, to, interval];
    let nameFilter = '';
    if (name) {
      nameFilter = `AND payload->>'name' = $5`;
      params.push(name);
    }

    /**
     * 优先使用 TimescaleDB 的 time_bucket
     * 降级逻辑与 getErrorRateSeries 相同
     */
    try {
      const result = await this.pg.query(
        `SELECT
           time_bucket($4::interval, ts) AS bucket,
           payload->>'name' AS name,
           AVG(COALESCE((payload->>'value')::float, 0)) AS avg_value,
           COUNT(*) AS sample_count
         FROM events
         WHERE app_id = $1
           AND type = 'vital'
           AND ts >= $2::timestamptz
           AND ts <= $3::timestamptz
           ${nameFilter}
         GROUP BY bucket, payload->>'name'
         ORDER BY bucket`,
        params,
      );

      return result.rows;
    } catch (err: any) {
      /**
       * 降级到 date_trunc
       * 当 TimescaleDB 的 time_bucket 函数不可用时使用
       */
      if (
        err.message &&
        err.message.includes('time_bucket') &&
        err.message.includes('does not exist')
      ) {
        const truncPrecision = this.intervalToTruncPrecision(interval);
        const fallbackParams: any[] = [appId, from, to, truncPrecision];
        let fallbackNameFilter = '';
        if (name) {
          fallbackNameFilter = `AND payload->>'name' = $5`;
          fallbackParams.push(name);
        }

        const result = await this.pg.query(
          `SELECT
             date_trunc($4, ts) AS bucket,
             payload->>'name' AS name,
             AVG(COALESCE((payload->>'value')::float, 0)) AS avg_value,
             COUNT(*) AS sample_count
           FROM events
           WHERE app_id = $1
             AND type = 'vital'
             AND ts >= $2::timestamptz
             AND ts <= $3::timestamptz
             ${fallbackNameFilter}
           GROUP BY bucket, payload->>'name'
           ORDER BY bucket`,
          fallbackParams,
        );

        return result.rows;
      }

      throw err;
    }
  }
}

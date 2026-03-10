/**
 * @file 指标查询 API 接口
 * @description 封装与性能指标、时序数据相关的所有 HTTP 请求
 *
 * 对应 Gateway 接口：
 * - GET /v1/metrics/error-rate  → 错误率时序数据（用于折线图）
 * - GET /v1/metrics/api         → 接口耗时统计（P50/P75/P99）
 * - GET /v1/metrics/vitals      → Web Vitals 时序数据（LCP/CLS/TTFB/INP）
 *
 * 数据来源：
 *   所有指标数据存储在 PostgreSQL events 表中（TimescaleDB 超表），
 *   后端使用 time_bucket() 函数进行时间聚合，返回适合图表渲染的时序数据点。
 */
import { apiClient } from './client';

/* ================================================================
   类型定义
   ================================================================ */

/**
 * 时序数据点
 * ECharts 折线图的基本数据单元
 *
 * @property time - 时间桶的起始时间（ISO 8601 格式，如 "2024-01-01T00:00:00Z"）
 *                  由 TimescaleDB 的 time_bucket() 函数生成
 * @property value - 该时间桶内的聚合值（如错误率百分比、平均耗时等）
 */
export interface TimeSeriesPoint {
  time: string;
  value: number;
}

/**
 * 接口耗时统计项
 * 展示每个 API 端点的性能分位数
 *
 * @property endpoint - 接口路径（如 "/api/users"、"/api/orders"）
 * @property p50 - 50 分位数（中位数），单位 ms
 * @property p75 - 75 分位数，单位 ms
 * @property p99 - 99 分位数（长尾延迟），单位 ms
 * @property count - 该接口在时间范围内的总请求次数
 * @property errorRate - 该接口的错误率（4xx + 5xx 占比），百分比
 */
export interface ApiMetricItem {
  endpoint: string;
  p50: number;
  p75: number;
  p99: number;
  count: number;
  errorRate: number;
}

/**
 * Web Vitals 时序数据
 * 包含各项核心指标的时序趋势
 *
 * @property lcp - Largest Contentful Paint（最大内容绘制）时序数据，单位 ms
 * @property cls - Cumulative Layout Shift（累积布局偏移）时序数据，无单位
 * @property ttfb - Time to First Byte（首字节时间）时序数据，单位 ms
 * @property inp - Interaction to Next Paint（交互到下一次绘制）时序数据，单位 ms
 */
export interface VitalsSeriesData {
  lcp: TimeSeriesPoint[];
  cls: TimeSeriesPoint[];
  ttfb: TimeSeriesPoint[];
  inp: TimeSeriesPoint[];
}

/**
 * 时序查询通用参数
 *
 * @property start - 时间范围起始（ISO 8601 格式）
 * @property end - 时间范围结束（ISO 8601 格式）
 * @property interval - 时间桶粒度（如 '5m', '1h', '1d'）
 *                      决定了图表上数据点的密度
 *                      短时间范围用小粒度（5m），长时间范围用大粒度（1d）
 */
export interface MetricsQueryParams {
  start: string;
  end: string;
  interval?: string;
}

/* ================================================================
   API 函数
   ================================================================ */

/**
 * 获取错误率时序数据
 *
 * 调用 Gateway 的 GET /v1/metrics/error-rate 接口
 * 返回指定时间范围内的错误率趋势数据，用于概览页的错误率折线图
 *
 * 后端 SQL 逻辑（简化）：
 *   SELECT time_bucket($interval, ts) AS time,
 *          COUNT(*) FILTER (WHERE type = 'error')::float / COUNT(*) * 100 AS value
 *   FROM events WHERE ts BETWEEN $start AND $end
 *   GROUP BY time ORDER BY time
 *
 * @param params - 查询参数（时间范围 + 聚合粒度）
 * @returns 错误率时序数据点数组，value 为百分比（0-100）
 */
export async function getErrorRateSeries(params: MetricsQueryParams): Promise<TimeSeriesPoint[]> {
  const { data } = await apiClient.get<TimeSeriesPoint[]>('/metrics/error-rate', {
    params: { from: params.start, to: params.end, interval: params.interval },
  });
  return data;
}

/**
 * 获取接口耗时统计
 *
 * 调用 Gateway 的 GET /v1/metrics/api 接口
 * 返回各 API 端点的性能分位数统计，用于性能页面的接口耗时排行表
 *
 * 后端 SQL 逻辑（简化）：
 *   SELECT payload->>'apiUrl' AS endpoint,
 *          percentile_cont(0.50) WITHIN GROUP (ORDER BY duration) AS p50,
 *          percentile_cont(0.75) ... AS p75,
 *          percentile_cont(0.99) ... AS p99,
 *          COUNT(*),
 *          COUNT(*) FILTER (WHERE status >= 400) / COUNT(*) * 100 AS errorRate
 *   FROM events WHERE type = 'api' AND ts BETWEEN $start AND $end
 *   GROUP BY endpoint ORDER BY p99 DESC
 *
 * @param params - 查询参数（时间范围）
 * @returns 接口耗时统计数组，按 P99 降序排列
 */
export async function getApiMetrics(params: MetricsQueryParams): Promise<ApiMetricItem[]> {
  const { data } = await apiClient.get<ApiMetricItem[]>('/metrics/api', {
    params: { from: params.start, to: params.end },
  });
  return data;
}

/**
 * 获取 Web Vitals 时序数据
 *
 * 调用 Gateway 的 GET /v1/metrics/vitals 接口
 * 返回 LCP/CLS/TTFB/INP 四项核心指标的时序趋势数据
 *
 * 后端 SQL 逻辑（简化）：
 *   对每项 Vital 指标分别执行：
 *   SELECT time_bucket($interval, ts) AS time,
 *          AVG((payload->>'value')::float) AS value
 *   FROM events WHERE type = 'vital' AND payload->>'name' = $vitalName
 *   GROUP BY time ORDER BY time
 *
 * @param params - 查询参数（时间范围 + 聚合粒度）
 * @returns 包含四项 Vital 指标时序数据的对象
 */
export async function getVitalsSeries(params: MetricsQueryParams): Promise<VitalsSeriesData> {
  const { data } = await apiClient.get<VitalsSeriesData>('/metrics/vitals', {
    params: { from: params.start, to: params.end, interval: params.interval },
  });
  return data;
}

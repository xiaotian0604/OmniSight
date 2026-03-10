/**
 * @file 指标数据请求 Hooks
 * @description 基于 @tanstack/react-query 封装的数据请求 hooks
 *
 * 这些 hooks 将 API 请求与 React 组件生命周期绑定，提供：
 * 1. 自动缓存 — 相同参数的请求会命中缓存，避免重复请求
 * 2. 自动刷新 — 数据过期后（staleTime）后台自动重新请求
 * 3. 加载/错误状态 — 自动管理 isLoading、isError、error 状态
 * 4. 时间范围联动 — 从全局 store 读取 timeRange，范围变化时自动重新请求
 *
 * React Query 核心概念：
 * - queryKey: 缓存键，数组格式，内容变化时触发重新请求
 * - queryFn: 实际的数据请求函数
 * - staleTime: 数据"新鲜"时间，在此期间不会后台重新请求
 * - enabled: 是否启用查询（false 时不会发起请求）
 *
 * 使用方式：
 *   const { data, isLoading, error } = useErrorRateSeries();
 *   // data 类型自动推导为 TimeSeriesPoint[]
 */
import { useQuery } from '@tanstack/react-query';
import { getErrorRateSeries, getApiMetrics, getVitalsSeries } from '@/api/metrics';
import type { TimeSeriesPoint, ApiMetricItem, VitalsSeriesData } from '@/api/metrics';
import { useGlobalStore } from '@/store/global.store';

/**
 * 根据时间范围自动计算合适的聚合粒度
 *
 * 设计思路：
 * - 短时间范围（< 6h）用 5 分钟粒度，图表数据点密集，能看到细节变化
 * - 中等时间范围（6h ~ 24h）用 30 分钟粒度，平衡细节和概览
 * - 长时间范围（1d ~ 7d）用 1 小时粒度，展示趋势
 * - 超长时间范围（> 7d）用 1 天粒度，展示长期趋势
 *
 * 这样可以保证无论用户选择什么时间范围，图表上的数据点数量都在合理范围内
 * （大约 20~200 个点），既不会太密导致性能问题，也不会太稀看不出趋势
 *
 * @param start - 起始时间
 * @param end - 结束时间
 * @returns TimescaleDB time_bucket 支持的时间间隔字符串
 */
/**
 * 返回 PostgreSQL interval 格式的字符串
 * time_bucket() 需要标准 interval 格式如 '5 minutes'，而非缩写 '5m'
 */
function calculateInterval(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours <= 6) return '5 minutes';
  if (diffHours <= 24) return '30 minutes';
  if (diffHours <= 168) return '1 hour';
  return '1 day';
}

/**
 * 错误率时序数据 Hook
 *
 * 用于概览页的错误率趋势折线图
 * 从全局 store 读取 timeRange，自动计算聚合粒度
 *
 * queryKey 设计：['error-rate-series', start, end]
 *   - 'error-rate-series': 查询类型标识，用于缓存隔离
 *   - start/end: 时间范围参数，范围变化时自动重新请求
 *
 * @returns React Query 查询结果，data 类型为 TimeSeriesPoint[]
 */
export function useErrorRateSeries() {
  const { timeRange } = useGlobalStore();

  return useQuery<TimeSeriesPoint[]>({
    queryKey: ['error-rate-series', timeRange.start.toISOString(), timeRange.end.toISOString()],
    queryFn: () =>
      getErrorRateSeries({
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
        interval: calculateInterval(timeRange.start, timeRange.end),
      }),
  });
}

/**
 * 接口耗时统计 Hook
 *
 * 用于性能页面的接口耗时排行表
 * 返回各 API 端点的 P50/P75/P99 分位数
 *
 * queryKey 设计：['api-metrics', start, end]
 *   时间范围变化时重新查询，确保数据与用户选择的范围一致
 *
 * @returns React Query 查询结果，data 类型为 ApiMetricItem[]
 */
export function useApiMetrics() {
  const { timeRange } = useGlobalStore();

  return useQuery<ApiMetricItem[]>({
    queryKey: ['api-metrics', timeRange.start.toISOString(), timeRange.end.toISOString()],
    queryFn: () =>
      getApiMetrics({
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
      }),
  });
}

/**
 * Web Vitals 时序数据 Hook
 *
 * 用于概览页的 Vitals 评分卡和性能页面的 Vitals 趋势图
 * 返回 LCP/CLS/TTFB/INP 四项指标的时序数据
 *
 * queryKey 设计：['vitals-series', start, end]
 *   与其他 metrics hook 保持一致的缓存策略
 *
 * 数据用途：
 * - 概览页 VitalsScore 组件：取最新一个数据点的值，判断 good/needs-improvement/poor
 * - 性能页面趋势图：将时序数据渲染为 ECharts 折线图
 *
 * @returns React Query 查询结果，data 类型为 VitalsSeriesData
 */
export function useVitalsSeries() {
  const { timeRange } = useGlobalStore();

  return useQuery<VitalsSeriesData>({
    queryKey: ['vitals-series', timeRange.start.toISOString(), timeRange.end.toISOString()],
    queryFn: () =>
      getVitalsSeries({
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
        interval: calculateInterval(timeRange.start, timeRange.end),
      }),
  });
}

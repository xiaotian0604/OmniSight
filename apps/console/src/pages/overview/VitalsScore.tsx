/**
 * @file Web Vitals 评分卡组件
 * @description 展示 LCP/CLS/TTFB/INP 四项核心性能指标的当前评分
 *
 * Web Vitals 是 Google 定义的一组衡量用户体验的核心指标：
 * - LCP (Largest Contentful Paint): 最大内容绘制时间，衡量加载性能
 *   - Good: ≤ 2500ms | Needs Improvement: ≤ 4000ms | Poor: > 4000ms
 * - CLS (Cumulative Layout Shift): 累积布局偏移，衡量视觉稳定性
 *   - Good: ≤ 0.1 | Needs Improvement: ≤ 0.25 | Poor: > 0.25
 * - TTFB (Time to First Byte): 首字节时间，衡量服务器响应速度
 *   - Good: ≤ 800ms | Needs Improvement: ≤ 1800ms | Poor: > 1800ms
 * - INP (Interaction to Next Paint): 交互到下一次绘制，衡量交互响应性
 *   - Good: ≤ 200ms | Needs Improvement: ≤ 500ms | Poor: > 500ms
 *
 * 数据来源：
 *   useVitalsSeries hook → GET /v1/metrics/vitals
 *   取每项指标时序数据的最新一个点的值作为当前评分
 *
 * 评分颜色：
 * - 绿色 (good): 指标在健康范围内
 * - 黄色 (needs-improvement): 指标需要优化
 * - 红色 (poor): 指标严重不达标
 *
 * 面试讲解要点：
 * - 展示对 Web Vitals 各项指标的深入理解
 * - 阈值来源于 Google 官方标准
 * - 评分卡的三态颜色设计
 */
import { useMemo } from 'react';
import { useVitalsSeries } from '@/hooks/useMetrics';
import type { TimeSeriesPoint } from '@/api/metrics';

/**
 * Vital 指标配置
 *
 * @property key - 指标标识（对应 VitalsSeriesData 的属性名）
 * @property label - 指标显示名称
 * @property unit - 单位（ms 或无单位）
 * @property thresholds - 评分阈值 [good 上限, needs-improvement 上限]
 *                        超过第二个阈值即为 poor
 * @property format - 数值格式化函数（CLS 保留 3 位小数，其他保留整数）
 */
interface VitalConfig {
  key: 'lcp' | 'cls' | 'ttfb' | 'inp';
  label: string;
  unit: string;
  thresholds: [number, number];
  format: (value: number) => string;
}

/**
 * 四项 Vital 指标的配置
 * 阈值参考 Google Web Vitals 官方标准：
 * https://web.dev/vitals/
 */
const VITAL_CONFIGS: VitalConfig[] = [
  {
    key: 'lcp',
    label: 'LCP',
    unit: 'ms',
    thresholds: [2500, 4000],
    format: (v) => `${Math.round(v)}`,
  },
  {
    key: 'cls',
    label: 'CLS',
    unit: '',
    thresholds: [0.1, 0.25],
    format: (v) => v.toFixed(3),
  },
  {
    key: 'ttfb',
    label: 'TTFB',
    unit: 'ms',
    thresholds: [800, 1800],
    format: (v) => `${Math.round(v)}`,
  },
  {
    key: 'inp',
    label: 'INP',
    unit: 'ms',
    thresholds: [200, 500],
    format: (v) => `${Math.round(v)}`,
  },
];

/**
 * 根据指标值和阈值判断评分等级
 *
 * @param value - 指标当前值
 * @param thresholds - [good 上限, needs-improvement 上限]
 * @returns 评分等级：'good' | 'needs-improvement' | 'poor'
 */
function getRating(value: number, thresholds: [number, number]): 'good' | 'needs-improvement' | 'poor' {
  if (value <= thresholds[0]) return 'good';
  if (value <= thresholds[1]) return 'needs-improvement';
  return 'poor';
}

/**
 * 评分等级对应的中文标签
 * 用于屏幕阅读器和 Tooltip
 */
const RATING_LABELS: Record<string, string> = {
  good: '良好',
  'needs-improvement': '需改进',
  poor: '较差',
};

/**
 * 从时序数据中提取最新值
 * 取数组最后一个元素的 value（时序数据按时间升序排列）
 *
 * @param series - 时序数据点数组
 * @returns 最新值，如果数组为空则返回 null
 */
function getLatestValue(series: TimeSeriesPoint[] | undefined): number | null {
  if (!series || series.length === 0) return null;
  return series[series.length - 1].value;
}

/**
 * VitalsScore 评分卡组件
 *
 * 渲染逻辑：
 * 1. 调用 useVitalsSeries hook 获取四项指标的时序数据
 * 2. 从每项指标的时序数据中提取最新值
 * 3. 根据阈值判断评分等级（good/needs-improvement/poor）
 * 4. 以四列网格布局渲染评分卡，每张卡片显示：
 *    - 指标名称（如 "LCP"）
 *    - 当前数值（带单位）
 *    - 评分徽章（颜色标识健康状态）
 *
 * 交互行为：
 * - 无直接交互，数据随全局 timeRange 变更自动刷新
 * - 评分卡颜色直观反映指标健康状况
 */
export function VitalsScore() {
  const { data, isLoading } = useVitalsSeries();

  /**
   * 计算每项指标的评分数据
   * useMemo 缓存计算结果，避免每次渲染重复计算
   */
  const scores = useMemo(() => {
    return VITAL_CONFIGS.map((config) => {
      const series = data?.[config.key];
      const value = getLatestValue(series);
      const rating = value !== null ? getRating(value, config.thresholds) : null;

      return {
        ...config,
        value,
        rating,
      };
    });
  }, [data]);

  /**
   * 加载状态：显示骨架屏效果
   */
  if (isLoading) {
    return (
      <div className="grid-4">
        {VITAL_CONFIGS.map((config) => (
          <div key={config.key} className="score-card">
            <div className="score-card-label">{config.label}</div>
            <div className="score-card-value" style={{ color: '#484f58' }}>
              --
            </div>
            <span className="badge badge-info">加载中</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid-4">
      {scores.map((score) => (
        <div key={score.key} className="score-card">
          {/* 指标名称 */}
          <div className="score-card-label">{score.label}</div>

          {/*
            指标数值
            className 根据评分等级动态设置，控制数字颜色：
            - good: 绿色
            - needs-improvement: 黄色
            - poor: 红色
          */}
          <div className={`score-card-value ${score.rating || ''}`}>
            {score.value !== null ? score.format(score.value) : '--'}
            {/* 单位（如 ms），使用小号字体 */}
            {score.unit && score.value !== null && (
              <span style={{ fontSize: '14px', marginLeft: '2px', color: '#8b949e' }}>
                {score.unit}
              </span>
            )}
          </div>

          {/*
            评分徽章
            使用 StatusBadge 样式（badge-good / badge-needs-improvement / badge-poor）
            显示评分等级的中文标签
          */}
          {score.rating && (
            <span className={`badge badge-${score.rating}`}>
              {RATING_LABELS[score.rating]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

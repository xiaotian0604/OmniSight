/**
 * @file 错误率趋势折线图组件
 * @description 使用 ECharts 渲染错误率的时序趋势折线图
 *
 * 数据来源：
 *   useErrorRateSeries hook → GET /v1/metrics/error-rate
 *   返回 TimeSeriesPoint[] 数组，每个点包含 time（时间桶）和 value（错误率百分比）
 *
 * 图表特性：
 * 1. 折线图 + 面积填充 — 直观展示错误率变化趋势
 * 2. 平滑曲线 — smooth: true，让折线更美观
 * 3. 渐变填充 — 从上到下由半透明红色渐变为透明，增强视觉层次
 * 4. Tooltip — 鼠标悬停显示具体时间和错误率数值
 * 5. 自适应时间格式 — 根据时间范围自动调整 X 轴的时间显示格式
 *
 * 交互行为：
 * - 鼠标悬停：显示 Tooltip，展示具体时间点的错误率
 * - 时间范围变更：自动重新请求数据并更新图表
 *
 * 面试讲解要点：
 * - 使用 TimescaleDB 的 time_bucket 函数进行时间聚合
 * - 聚合粒度根据时间范围自动调整（5m/30m/1h/1d）
 * - ECharts 的渐变填充和平滑曲线配置
 */
import { useMemo } from 'react';
import { MetricChart } from '@/components/MetricChart';
import { useErrorRateSeries } from '@/hooks/useMetrics';
import type { EChartsOption } from 'echarts';

/**
 * ErrorRateChart 组件
 *
 * 渲染逻辑：
 * 1. 调用 useErrorRateSeries hook 获取数据和加载状态
 * 2. 将 TimeSeriesPoint[] 转换为 ECharts 需要的 xAxis/series 格式
 * 3. 配置折线图样式（颜色、渐变、Tooltip 等）
 * 4. 传给 MetricChart 组件渲染
 *
 * 性能优化：
 * - 使用 useMemo 缓存 ECharts option 配置，避免每次渲染都重新计算
 * - 依赖项为 data，只有数据变化时才重新生成配置
 */
export function ErrorRateChart() {
  /**
   * 从 useErrorRateSeries hook 获取：
   * - data: TimeSeriesPoint[] 时序数据点数组
   * - isLoading: 是否正在加载
   */
  const { data, isLoading } = useErrorRateSeries();

  /**
   * 构建 ECharts 配置对象
   *
   * useMemo 依赖 data，数据变化时重新计算配置
   * 避免每次组件重渲染都创建新的配置对象
   */
  const chartOption = useMemo<EChartsOption>(() => {
    if (!data || data.length === 0) return {};

    /**
     * 提取 X 轴数据（时间）和 Y 轴数据（错误率）
     * time: ISO 8601 字符串 → ECharts 会自动解析为时间轴
     * value: 错误率百分比（0-100）
     */
    const xData = data.map((point) => point.time);
    const yData = data.map((point) => point.value);

    return {
      /**
       * Tooltip 配置
       * trigger: 'axis' — 鼠标悬停时显示该时间点上所有系列的数据
       * formatter: 自定义格式化，显示时间和错误率百分比
       */
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const p = (params as Array<{ axisValue: string; value: number }>)[0];
          if (!p) return '';
          const time = new Date(p.axisValue).toLocaleString('zh-CN');
          return `${time}<br/>错误率: <strong>${p.value.toFixed(2)}%</strong>`;
        },
      },

      /**
       * X 轴配置 — 时间轴
       * type: 'category' — 使用分类轴（数据点已经是离散的时间桶）
       * axisLabel.formatter: 格式化时间显示，只显示时:分
       */
      xAxis: {
        type: 'category',
        data: xData,
        axisLabel: {
          formatter: (value: string) => {
            const date = new Date(value);
            return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
          },
          color: '#8b949e',
        },
        axisLine: { lineStyle: { color: '#30363d' } },
      },

      /**
       * Y 轴配置 — 错误率百分比
       * axisLabel.formatter: 添加 % 后缀
       * splitLine: 网格线使用虚线，颜色与深色主题一致
       */
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: '{value}%',
          color: '#8b949e',
        },
        splitLine: {
          lineStyle: { color: '#21262d', type: 'dashed' },
        },
      },

      /**
       * 数据系列配置 — 折线图 + 面积填充
       *
       * smooth: true — 平滑曲线，视觉效果更好
       * areaStyle: 面积填充，使用从红色到透明的线性渐变
       *   - 上方（offset: 0）：半透明红色 rgba(248, 81, 73, 0.3)
       *   - 下方（offset: 1）：完全透明 rgba(248, 81, 73, 0)
       * itemStyle.color: 数据点和折线的颜色（红色，与错误主题一致）
       * symbol: 'circle' — 数据点形状为圆形
       * symbolSize: 4 — 数据点大小（不宜太大，避免遮挡折线）
       */
      series: [
        {
          name: '错误率',
          type: 'line',
          data: yData,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          itemStyle: {
            color: '#f85149',
          },
          lineStyle: {
            width: 2,
            color: '#f85149',
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(248, 81, 73, 0.3)' },
                { offset: 1, color: 'rgba(248, 81, 73, 0)' },
              ],
            },
          },
        },
      ],
    };
  }, [data]);

  return (
    <MetricChart
      option={chartOption}
      loading={isLoading}
      height="300px"
      empty={!isLoading && (!data || data.length === 0)}
      emptyText="暂无错误率数据"
    />
  );
}

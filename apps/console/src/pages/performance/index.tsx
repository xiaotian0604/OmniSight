/**
 * @file 性能分析页面
 * @description 展示 Web Vitals 趋势和接口耗时分布
 *
 * 页面布局：
 * ┌─────────────────────────────────────────────────┐
 * │  页面标题：性能分析                               │
 * ├─────────────────────────────────────────────────┤
 * │  ┌─────────────────────────────────────────┐    │
 * │  │  Web Vitals 趋势图                       │    │
 * │  │  LCP / CLS / TTFB / INP 四条折线        │    │
 * │  └─────────────────────────────────────────┘    │
 * │                                                 │
 * │  ┌──────────────────┐  ┌────────────────────┐  │
 * │  │  ApiTable         │  │  ResourceChart     │  │
 * │  │  接口耗时排行     │  │  资源加载分析       │  │
 * │  └──────────────────┘  └────────────────────┘  │
 * └─────────────────────────────────────────────────┘
 *
 * 数据来源：
 * - Vitals 趋势：useVitalsSeries hook → GET /v1/metrics/vitals
 * - 接口耗时：useApiMetrics hook → GET /v1/metrics/api
 * - 资源加载：TODO（后续从 resource 类型事件中提取）
 *
 * 面试讲解要点：
 * - Web Vitals 是 Google 定义的核心用户体验指标
 * - P50/P75/P99 分位数的含义和重要性
 * - TimescaleDB 的 percentile_cont 函数用于计算分位数
 * - 时序数据的聚合粒度自动调整策略
 */
import { useMemo } from 'react';
import { MetricChart } from '@/components/MetricChart';
import { useVitalsSeries } from '@/hooks/useMetrics';
import { ApiTable } from './ApiTable';
import { ResourceChart } from './ResourceChart';
import type { EChartsOption } from 'echarts';

/**
 * 性能分析页面组件
 *
 * 渲染逻辑：
 * 1. 页面标题 + 描述
 * 2. Web Vitals 趋势折线图（LCP/CLS/TTFB/INP 四条线）
 * 3. 两栏布局：左侧 ApiTable + 右侧 ResourceChart
 */
export default function PerformancePage() {
  const { data: vitalsData, isLoading: vitalsLoading } = useVitalsSeries();

  /**
   * 构建 Vitals 趋势图的 ECharts 配置
   *
   * 四项指标使用不同颜色：
   * - LCP: 蓝色 (#58a6ff) — 加载性能
   * - CLS: 黄色 (#d29922) — 视觉稳定性
   * - TTFB: 绿色 (#3fb950) — 服务器响应
   * - INP: 紫色 (#bc8cff) — 交互响应性
   *
   * 注意：CLS 的数值范围（0~1）与其他指标（ms 级别）差异很大，
   * 所以使用双 Y 轴：左轴显示 ms 指标，右轴显示 CLS
   */
  const vitalsChartOption = useMemo<EChartsOption>(() => {
    if (!vitalsData) return {};

    /**
     * 使用 LCP 的时间轴作为 X 轴
     * 所有指标共享相同的时间桶，所以取任一指标的时间即可
     */
    const xData = vitalsData.lcp?.map((p) => p.time) || [];

    return {
      tooltip: {
        trigger: 'axis',
      },

      /**
       * 图例配置
       * 显示在图表顶部，用户可以点击隐藏/显示某条线
       */
      legend: {
        data: ['LCP', 'TTFB', 'INP', 'CLS'],
        textStyle: { color: '#8b949e' },
      },

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
       * 双 Y 轴配置
       * 左轴（index 0）：LCP/TTFB/INP（单位 ms）
       * 右轴（index 1）：CLS（无单位，范围 0~1）
       */
      yAxis: [
        {
          type: 'value',
          name: 'ms',
          axisLabel: { color: '#8b949e' },
          splitLine: { lineStyle: { color: '#21262d', type: 'dashed' } },
        },
        {
          type: 'value',
          name: 'CLS',
          axisLabel: { color: '#8b949e' },
          splitLine: { show: false },
        },
      ],

      series: [
        {
          name: 'LCP',
          type: 'line',
          data: vitalsData.lcp?.map((p) => p.value) || [],
          smooth: true,
          symbol: 'none',
          itemStyle: { color: '#58a6ff' },
          yAxisIndex: 0,
        },
        {
          name: 'TTFB',
          type: 'line',
          data: vitalsData.ttfb?.map((p) => p.value) || [],
          smooth: true,
          symbol: 'none',
          itemStyle: { color: '#3fb950' },
          yAxisIndex: 0,
        },
        {
          name: 'INP',
          type: 'line',
          data: vitalsData.inp?.map((p) => p.value) || [],
          smooth: true,
          symbol: 'none',
          itemStyle: { color: '#bc8cff' },
          yAxisIndex: 0,
        },
        {
          name: 'CLS',
          type: 'line',
          data: vitalsData.cls?.map((p) => p.value) || [],
          smooth: true,
          symbol: 'none',
          itemStyle: { color: '#d29922' },
          yAxisIndex: 1,
        },
      ],
    };
  }, [vitalsData]);

  return (
    <div>
      {/* 页面标题 */}
      <div className="page-header">
        <div className="page-header-info">
          <h2>性能分析</h2>
          <p>Web Vitals 趋势、接口耗时分布和资源加载分析</p>
        </div>
      </div>

      {/* Web Vitals 趋势图 */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">Web Vitals 趋势</span>
          <span className="card-subtitle">LCP / CLS / TTFB / INP 指标变化趋势</span>
        </div>
        <MetricChart
          option={vitalsChartOption}
          loading={vitalsLoading}
          height="350px"
          empty={!vitalsLoading && !vitalsData}
          emptyText="暂无 Vitals 数据"
        />
      </div>

      {/* 接口耗时 + 资源加载：两栏布局 */}
      <div className="grid-2">
        {/* 接口耗时排行表 */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">接口耗时排行</span>
            <span className="card-subtitle">P50 / P75 / P99 分位数</span>
          </div>
          <ApiTable />
        </div>

        {/* 资源加载分析 */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">资源加载分析</span>
            <span className="card-subtitle">各类型资源的加载耗时分布</span>
          </div>
          <ResourceChart />
        </div>
      </div>
    </div>
  );
}

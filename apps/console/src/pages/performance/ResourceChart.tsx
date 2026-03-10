/**
 * @file 资源加载分析图表组件
 * @description 展示各类型资源（JS/CSS/图片/字体等）的加载耗时分布
 *
 * 数据来源：
 *   目前使用模拟数据展示图表效果
 *   后续接入：useQuery → GET /v1/metrics/resources
 *   后端从 events 表中 type='resource' 的事件提取数据
 *
 * 图表类型：
 *   水平柱状图（Horizontal Bar Chart）
 *   每种资源类型一行，柱子长度表示平均加载耗时
 *   颜色区分不同资源类型
 *
 * 资源类型说明：
 * - script: JavaScript 文件（通常是最大的资源）
 * - stylesheet: CSS 样式表
 * - img: 图片资源
 * - font: 字体文件
 * - fetch/xhr: API 请求（与 ApiTable 有重叠，但这里关注的是资源加载视角）
 *
 * SDK 采集原理：
 *   使用 PerformanceObserver 监听 'resource' 类型的性能条目
 *   每个条目包含：name（URL）、initiatorType（资源类型）、duration（加载耗时）
 *   SDK 将这些数据作为 type='resource' 的事件上报
 *
 * 面试讲解要点：
 * - PerformanceObserver API 的使用
 * - 资源加载瀑布图的概念
 * - 优化策略：代码分割、图片懒加载、字体预加载等
 */
import { useMemo } from 'react';
import { MetricChart } from '@/components/MetricChart';
import type { EChartsOption } from 'echarts';

/**
 * 资源类型配置
 * 定义每种资源类型的显示名称和颜色
 */
const RESOURCE_TYPES = [
  { type: 'script', label: 'JavaScript', color: '#58a6ff' },
  { type: 'stylesheet', label: 'CSS', color: '#3fb950' },
  { type: 'img', label: '图片', color: '#d29922' },
  { type: 'font', label: '字体', color: '#bc8cff' },
  { type: 'fetch', label: 'Fetch/XHR', color: '#f85149' },
];

/**
 * ResourceChart 资源加载分析图表组件
 *
 * 渲染逻辑：
 * 1. 构建水平柱状图的 ECharts 配置
 * 2. Y 轴显示资源类型名称
 * 3. X 轴显示平均加载耗时（ms）
 * 4. 每种资源类型使用不同颜色
 *
 * 当前状态：
 * 使用占位数据展示图表样式，后续接入真实 API 数据
 * 占位数据的值是合理的典型值，便于面试演示
 */
export function ResourceChart() {
  /**
   * 构建 ECharts 配置
   *
   * 使用水平柱状图（横向 bar）：
   * - Y 轴为分类轴（资源类型名称）
   * - X 轴为数值轴（加载耗时 ms）
   * - 每个柱子使用对应资源类型的颜色
   */
  const chartOption = useMemo<EChartsOption>(() => {
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const p = (params as Array<{ name: string; value: number }>)[0];
          if (!p) return '';
          return `${p.name}: <strong>${p.value}ms</strong>`;
        },
      },

      /**
       * Y 轴：资源类型名称
       * inverse: true — 从上到下排列（最慢的在上方）
       */
      yAxis: {
        type: 'category',
        data: RESOURCE_TYPES.map((r) => r.label),
        axisLabel: { color: '#8b949e' },
        axisLine: { lineStyle: { color: '#30363d' } },
      },

      /**
       * X 轴：加载耗时（ms）
       */
      xAxis: {
        type: 'value',
        axisLabel: {
          formatter: '{value}ms',
          color: '#8b949e',
        },
        splitLine: { lineStyle: { color: '#21262d', type: 'dashed' } },
      },

      series: [
        {
          type: 'bar',
          /**
           * 占位数据：各资源类型的典型平均加载耗时
           * - JavaScript: 320ms（通常最大，包含 bundle）
           * - CSS: 85ms（样式表较小）
           * - 图片: 450ms（图片通常较大）
           * - 字体: 120ms（字体文件中等大小）
           * - Fetch/XHR: 200ms（API 请求耗时）
           *
           * TODO: 替换为真实 API 数据
           */
          data: RESOURCE_TYPES.map((r, index) => ({
            value: [320, 85, 450, 120, 200][index],
            itemStyle: { color: r.color },
          })),
          barWidth: '60%',
          label: {
            show: true,
            position: 'right',
            formatter: '{c}ms',
            color: '#8b949e',
            fontSize: 11,
          },
        },
      ],
    };
  }, []);

  return (
    <MetricChart
      option={chartOption}
      height="250px"
    />
  );
}

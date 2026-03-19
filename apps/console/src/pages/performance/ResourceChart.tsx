/**
 * @file 资源加载分析图表组件
 * @description 展示各类型资源（JS/CSS/图片/字体等）的加载耗时分布
 *
 * 数据来源：
 *   当前版本尚未接入资源聚合接口。
 *   之前这里显示的是占位假数据，会误导控制台使用者；现改为空状态提示。
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
import { MetricChart } from '@/components/MetricChart';

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
 * 资源聚合接口尚未落地，因此这里明确展示为空状态，
 * 避免把 mock 数据误当成真实监控结果。
 */
export function ResourceChart() {
  return (
    <MetricChart
      option={{}}
      height="250px"
      empty
      emptyText="资源指标尚未接入"
    />
  );
}

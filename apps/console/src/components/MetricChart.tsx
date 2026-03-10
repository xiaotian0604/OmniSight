/**
 * @file 指标图表封装组件
 * @description 基于 echarts-for-react 封装的通用时序图表组件
 *
 * 设计思路：
 * 本组件是对 @omnisight/ui-components 中 MetricChart 的本地封装，
 * 在其基础上添加了加载状态、空状态处理和深色主题配置。
 *
 * 如果 @omnisight/ui-components 包已发布且可用，可以直接从中导入 MetricChart；
 * 在开发初期，我们先在本地实现完整功能，后续再迁移到共享包中。
 *
 * 功能说明：
 * 1. 加载状态 — 数据请求中时显示加载动画
 * 2. 空状态 — 无数据时显示友好的空状态提示
 * 3. 深色主题 — 自动应用与控制台一致的深色配色方案
 * 4. 响应式 — 图表宽度自适应容器，高度可配置
 *
 * Props 说明：
 * @prop option - ECharts 配置对象（series、xAxis、yAxis 等）
 * @prop loading - 是否显示加载状态
 * @prop height - 图表高度（默认 300px）
 * @prop empty - 是否为空数据状态
 * @prop emptyText - 空状态提示文本
 */
import ReactEChartsCore from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { EmptyState } from './EmptyState';

/**
 * MetricChart 组件的 Props 类型定义
 */
interface MetricChartProps {
  /**
   * ECharts 配置对象
   * 包含 series（数据系列）、xAxis（X 轴）、yAxis（Y 轴）、tooltip 等配置
   * 具体配置参考 ECharts 官方文档：https://echarts.apache.org/zh/option.html
   */
  option: EChartsOption;

  /**
   * 是否显示加载状态
   * 为 true 时在图表区域显示 ECharts 内置的加载动画
   * 通常与 React Query 的 isLoading 状态绑定
   */
  loading?: boolean;

  /**
   * 图表高度
   * 支持 CSS 长度值（如 '300px'、'50vh'）
   * 默认值：'300px'
   */
  height?: string;

  /**
   * 是否为空数据状态
   * 为 true 时隐藏图表，显示 EmptyState 组件
   * 通常在 data 为空数组时设置为 true
   */
  empty?: boolean;

  /**
   * 空状态提示文本
   * 当 empty 为 true 时显示的描述文字
   * 默认值：'暂无数据'
   */
  emptyText?: string;
}

/**
 * ECharts 深色主题配置
 *
 * 与控制台的 CSS 变量保持一致的配色方案
 * 包括背景色、文字色、坐标轴颜色、提示框样式等
 *
 * 为什么不使用 ECharts 内置的 dark 主题？
 * 内置 dark 主题的配色与我们的设计系统不完全匹配，
 * 自定义主题可以确保图表与页面其他元素视觉一致
 */
const DARK_THEME_OVERRIDES: EChartsOption = {
  /**
   * 背景色设为透明，使用外层容器的背景色
   * 这样图表可以无缝融入卡片组件中
   */
  backgroundColor: 'transparent',

  /**
   * 文字样式：使用设计系统的次要文字色
   */
  textStyle: {
    color: '#8b949e',
  },

  /**
   * 图例样式
   */
  legend: {
    textStyle: { color: '#8b949e' },
  },

  /**
   * 提示框（Tooltip）样式
   * 深色背景 + 浅色文字 + 圆角边框
   */
  tooltip: {
    backgroundColor: '#21283b',
    borderColor: '#30363d',
    textStyle: { color: '#e6edf3' },
  },

  /**
   * 网格（Grid）配置
   * 控制图表绘制区域的内边距
   */
  grid: {
    top: 40,
    right: 20,
    bottom: 30,
    left: 50,
    containLabel: true,
  },
};

/**
 * MetricChart 组件
 *
 * 渲染逻辑：
 * 1. 如果 empty 为 true → 渲染 EmptyState 组件
 * 2. 否则 → 渲染 ECharts 图表
 *    - 将传入的 option 与深色主题配置合并
 *    - 如果 loading 为 true，显示 ECharts 内置的加载动画
 *
 * ECharts 配置合并策略：
 *   深色主题配置（DARK_THEME_OVERRIDES）作为基础，
 *   传入的 option 覆盖其上，确保业务配置优先级更高
 */
export function MetricChart({
  option,
  loading = false,
  height = '300px',
  empty = false,
  emptyText = '暂无数据',
}: MetricChartProps) {
  if (empty) {
    return (
      <div style={{ height }}>
        <EmptyState icon="📈" title={emptyText} description="选择的时间范围内没有数据" />
      </div>
    );
  }

  /**
   * 合并 ECharts 配置
   * 使用展开运算符进行浅合并，深色主题作为默认值，业务配置覆盖
   *
   * 注意：对于嵌套对象（如 tooltip、grid），这里是替换而非深度合并
   * 如果需要深度合并，可以使用 lodash.merge 或手动处理
   */
  const mergedOption: EChartsOption = {
    ...DARK_THEME_OVERRIDES,
    ...option,
    tooltip: {
      ...(DARK_THEME_OVERRIDES.tooltip as object),
      ...(option.tooltip as object),
    },
    grid: {
      ...(DARK_THEME_OVERRIDES.grid as object),
      ...(option.grid as object),
    },
  };

  return (
    <ReactEChartsCore
      option={mergedOption}
      style={{ height, width: '100%' }}
      /**
       * showLoading: ECharts 内置的加载动画
       * 在数据请求期间显示，提升用户体验
       */
      showLoading={loading}
      /**
       * loadingOption: 自定义加载动画样式
       * 与深色主题配色一致
       */
      loadingOption={{
        text: '加载中...',
        color: '#58a6ff',
        textColor: '#8b949e',
        maskColor: 'rgba(15, 17, 23, 0.8)',
      }}
      /**
       * notMerge: false — 增量更新模式
       * 当 option 变化时，ECharts 会智能合并新旧配置，
       * 而不是完全重建图表，提升更新性能
       */
      notMerge={false}
      /**
       * lazyUpdate: true — 延迟更新
       * 在下一个动画帧才应用更新，避免频繁更新导致的性能问题
       */
      lazyUpdate={true}
    />
  );
}

/**
 * ---------------------------------------------------------------
 * @omnisight/ui-components — 统一导出入口
 *
 * 本文件是 @omnisight/ui-components 包的主入口，
 * 将所有公共 UI 组件统一导出，方便 Console 应用通过单一路径引用：
 *
 * @example
 * ```tsx
 * import { StatusBadge, MetricChart } from '@omnisight/ui-components';
 *
 * <StatusBadge status="good" label="LCP: 1.2s" />
 * <MetricChart title="错误率" data={chartData} color="#ef4444" />
 * ```
 * ---------------------------------------------------------------
 */

/** 导出状态徽章组件及其类型定义 */
export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps, StatusType } from './StatusBadge';

/** 导出时序折线图组件及其类型定义 */
export { MetricChart } from './MetricChart';
export type { MetricChartProps, MetricDataPoint } from './MetricChart';

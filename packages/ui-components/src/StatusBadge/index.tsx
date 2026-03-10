/**
 * ---------------------------------------------------------------
 * StatusBadge — 状态徽章组件
 *
 * 用于在 OmniSight 控制台中展示 Web Vitals 性能指标的评分状态。
 * 支持三种状态：
 *   - good（良好）            : 绿色背景，表示指标在推荐阈值内
 *   - needs-improvement（需改进）: 橙色背景，表示指标在中等范围
 *   - poor（较差）            : 红色背景，表示指标超出可接受范围
 *
 * 使用场景：
 *   - 概览仪表盘的 Vitals 评分卡
 *   - 性能页面的指标列表
 *   - 错误详情页的性能上下文展示
 *
 * 样式方案：
 *   采用 CSS-in-JS 内联样式，不依赖外部 CSS 文件，
 *   确保组件在任何项目中都能独立使用，无样式冲突。
 *
 * @example
 * ```tsx
 * import { StatusBadge } from '@omnisight/ui-components';
 *
 * <StatusBadge status="good" />
 * <StatusBadge status="needs-improvement" label="LCP: 2.8s" />
 * <StatusBadge status="poor" label="CLS: 0.35" />
 * ```
 * ---------------------------------------------------------------
 */

import { type CSSProperties, type FC } from 'react';

// ========================= 类型定义 =========================

/**
 * StatusType — 状态徽章支持的三种状态类型
 *
 * 与 Web Vitals 的 rating 字段完全对应：
 * - 'good'              : 良好（绿色）
 * - 'needs-improvement' : 需要改进（橙色）
 * - 'poor'              : 较差（红色）
 */
export type StatusType = 'good' | 'needs-improvement' | 'poor';

/**
 * StatusBadgeProps — StatusBadge 组件的属性接口
 */
export interface StatusBadgeProps {
  /**
   * 状态类型
   * 决定徽章的颜色和默认显示文本。
   * 必填项，取值范围见 StatusType。
   */
  status: StatusType;

  /**
   * 自定义显示文本（可选）
   * 如果不传，则使用状态对应的默认中文标签。
   * 传入后将覆盖默认标签，适用于需要显示具体数值的场景。
   * 示例: "LCP: 2.8s"
   */
  label?: string;

  /**
   * 自定义样式（可选）
   * 允许外部传入额外的 CSS 样式，会与内置样式合并。
   * 外部样式优先级高于内置样式（通过对象展开实现）。
   */
  style?: CSSProperties;
}

// ========================= 样式配置 =========================

/**
 * 状态到颜色的映射表
 * 每种状态对应一组背景色和文字色，确保视觉对比度满足可访问性要求。
 */
const STATUS_COLOR_MAP: Record<StatusType, { backgroundColor: string; color: string }> = {
  /** 良好状态：柔和的绿色背景 + 深绿色文字 */
  'good': {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  /** 需改进状态：柔和的橙色背景 + 深橙色文字 */
  'needs-improvement': {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  /** 较差状态：柔和的红色背景 + 深红色文字 */
  'poor': {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
};

/**
 * 状态到默认中文标签的映射表
 * 当组件未传入 label 属性时，使用此映射表中的默认文本。
 */
const STATUS_LABEL_MAP: Record<StatusType, string> = {
  'good': '良好',
  'needs-improvement': '需改进',
  'poor': '较差',
};

/**
 * 徽章的基础样式
 * 定义了圆角、内边距、字体大小等通用视觉属性。
 */
const BASE_STYLE: CSSProperties = {
  /** 行内弹性布局，使徽章宽度自适应内容 */
  display: 'inline-flex',
  /** 垂直居中对齐内部文本 */
  alignItems: 'center',
  /** 水平居中对齐 */
  justifyContent: 'center',
  /** 圆角边框，营造药丸形外观 */
  borderRadius: '9999px',
  /** 上下内边距 2px，左右内边距 10px */
  padding: '2px 10px',
  /** 小号字体，适合作为标签使用 */
  fontSize: '12px',
  /** 中等字重，保证文字清晰可读 */
  fontWeight: 500,
  /** 行高设为 20px，确保垂直居中 */
  lineHeight: '20px',
  /** 防止文本换行 */
  whiteSpace: 'nowrap',
};

// ========================= 组件实现 =========================

/**
 * StatusBadge — 状态徽章 React 函数组件
 *
 * 根据传入的 status 属性渲染对应颜色的药丸形徽章。
 * 支持自定义文本和额外样式。
 *
 * @param props - 组件属性，详见 StatusBadgeProps 接口定义
 * @returns 渲染的徽章 JSX 元素
 */
export const StatusBadge: FC<StatusBadgeProps> = ({ status, label, style }) => {
  /** 根据状态类型获取对应的颜色配置 */
  const colorConfig = STATUS_COLOR_MAP[status];

  /** 根据状态类型获取默认标签文本，如果传入了 label 则使用自定义文本 */
  const displayText = label ?? STATUS_LABEL_MAP[status];

  /**
   * 合并样式：基础样式 + 颜色样式 + 外部自定义样式
   * 使用对象展开运算符，后面的属性会覆盖前面的，
   * 因此外部传入的 style 优先级最高。
   */
  const mergedStyle: CSSProperties = {
    ...BASE_STYLE,
    ...colorConfig,
    ...style,
  };

  return (
    <span style={mergedStyle}>
      {displayText}
    </span>
  );
};

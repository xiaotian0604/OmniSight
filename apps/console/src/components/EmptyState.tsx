/**
 * @file 空状态占位组件
 * @description 当列表、图表等区域没有数据时显示的友好占位界面
 *
 * 使用场景：
 * 1. 错误列表为空 — "还没有捕获到错误，这是好事！"
 * 2. 录像列表为空 — "暂无录像数据"
 * 3. 图表无数据 — "选择的时间范围内没有数据"
 * 4. 搜索无结果 — "没有找到匹配的结果"
 *
 * 设计原则：
 * - 友好的视觉提示，避免用户看到空白区域感到困惑
 * - 提供可选的操作按钮，引导用户下一步操作
 * - 样式与深色主题一致，使用 CSS 类名 .empty-state 系列
 *
 * Props 说明：
 * @prop icon - 图标（Emoji 或 SVG），默认为 📭
 * @prop title - 标题文本
 * @prop description - 描述文本（可选）
 * @prop action - 操作按钮配置（可选）
 */

/**
 * EmptyState 组件的 Props 类型定义
 */
interface EmptyStateProps {
  /**
   * 顶部图标
   * 使用 Emoji 简化实现，生产环境建议替换为 SVG 图标
   * 默认值：'📭'（空邮箱，表示"没有内容"）
   */
  icon?: string;

  /**
   * 标题文本
   * 简洁明了地说明当前状态
   * 示例："暂无错误数据"、"没有找到匹配的结果"
   */
  title: string;

  /**
   * 描述文本（可选）
   * 对标题的补充说明，可以包含原因或建议
   * 示例："选择的时间范围内没有捕获到错误"、"尝试调整筛选条件"
   */
  description?: string;

  /**
   * 操作按钮配置（可选）
   * 提供一个引导用户下一步操作的按钮
   *
   * @property label - 按钮文本（如 "刷新数据"、"查看文档"）
   * @property onClick - 按钮点击回调
   */
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * EmptyState 空状态占位组件
 *
 * 渲染逻辑：
 * 1. 居中显示图标（大号 Emoji）
 * 2. 图标下方显示标题文本（粗体，主文字色）
 * 3. 标题下方显示描述文本（可选，次要文字色）
 * 4. 最下方显示操作按钮（可选，蓝色主按钮样式）
 *
 * 布局：使用 flexbox 垂直居中，适应不同容器高度
 */
export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      {/* 图标区域：大号显示，半透明效果 */}
      <div className="empty-state-icon">{icon}</div>

      {/* 标题：简洁说明当前状态 */}
      <h3 className="empty-state-title">{title}</h3>

      {/* 描述文本：补充说明（可选） */}
      {description && (
        <p className="empty-state-description">{description}</p>
      )}

      {/* 操作按钮：引导用户下一步（可选） */}
      {action && (
        <button
          className="btn btn-primary"
          onClick={action.onClick}
          style={{ marginTop: '16px' }}
          type="button"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

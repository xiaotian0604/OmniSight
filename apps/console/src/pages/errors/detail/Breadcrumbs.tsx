/**
 * @file 用户操作面包屑组件
 * @description 展示错误发生前的用户操作轨迹，帮助复现问题
 *
 * 面包屑（Breadcrumbs）是 SDK 在采集错误时同时记录的用户操作序列：
 * - 用户点击了哪些按钮
 * - 访问了哪些页面（路由变化）
 * - 发起了哪些接口请求
 * - 控制台输出了什么
 * - 之前是否有其他错误发生
 *
 * 这些信息按时间顺序排列，形成一条"面包屑轨迹"，
 * 帮助开发者理解错误发生时用户在做什么，从而更容易复现和定位问题。
 *
 * 视觉设计：
 * 使用时间轴（Timeline）样式，左侧是时间线和圆点标记，
 * 不同类型的操作用不同颜色的圆点区分：
 * - 红色：错误（error）
 * - 蓝色：点击（click）
 * - 紫色：导航（navigation）
 * - 灰色：其他（xhr、console）
 *
 * Props:
 * @prop breadcrumbs - 面包屑数组，按时间正序排列（最早的在上）
 */
import type { Breadcrumb } from '@/api/errors';

/**
 * Breadcrumbs 组件的 Props 类型
 */
interface BreadcrumbsProps {
  /**
   * 面包屑数组
   * 每个元素包含：type（操作类型）、message（描述）、timestamp（时间）、data（附加数据）
   * 按时间正序排列，最早的操作在最上方
   */
  breadcrumbs: Breadcrumb[];
}

/**
 * 操作类型到中文标签的映射
 */
const TYPE_LABELS: Record<string, string> = {
  click: '点击',
  navigation: '导航',
  xhr: '请求',
  console: '控制台',
  error: '错误',
};

/**
 * 操作类型到 CSS 类名的映射
 * 用于控制时间轴圆点的颜色
 */
const TYPE_CLASS: Record<string, string> = {
  click: 'click',
  navigation: 'navigation',
  xhr: '',
  console: '',
  error: 'error',
};

/**
 * 格式化时间戳为时:分:秒.毫秒格式
 * 面包屑关注的是相对时间顺序，只显示时间部分即可
 *
 * @param isoString - ISO 8601 格式的时间字符串
 * @returns 格式化后的时间字符串（如 "14:30:05.123"）
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Breadcrumbs 面包屑组件
 *
 * 渲染逻辑：
 * 1. 如果面包屑数组为空 → 显示"无操作记录"提示
 * 2. 否则渲染时间轴列表：
 *    - 每个面包屑项包含：时间轴圆点 + 时间 + 操作类型标签 + 操作描述
 *    - 圆点颜色根据操作类型变化
 *    - 如果有附加数据（如接口 URL、状态码），在描述下方展示
 *
 * 交互行为：
 * - 纯展示组件，无交互
 * - 错误类型的面包屑会用红色高亮，便于快速定位
 */
export function Breadcrumbs({ breadcrumbs }: BreadcrumbsProps) {
  if (!breadcrumbs || breadcrumbs.length === 0) {
    return (
      <div className="text-muted" style={{ padding: '16px', textAlign: 'center' }}>
        无操作记录
      </div>
    );
  }

  return (
    <div className="breadcrumb-list">
      {breadcrumbs.map((crumb, index) => (
        <div
          key={index}
          /**
           * 动态类名：
           * - 'breadcrumb-item': 基础样式
           * - TYPE_CLASS[crumb.type]: 根据操作类型添加颜色类名
           */
          className={`breadcrumb-item ${TYPE_CLASS[crumb.type] || ''}`}
        >
          {/* 时间戳：等宽字体，灰色 */}
          <span className="breadcrumb-time">
            {formatTime(crumb.timestamp)}
          </span>

          <div className="breadcrumb-content">
            {/* 操作类型标签：大写，根据类型着色 */}
            <div
              className="breadcrumb-type"
              style={{
                color:
                  crumb.type === 'error'
                    ? '#f85149'
                    : crumb.type === 'click'
                      ? '#58a6ff'
                      : crumb.type === 'navigation'
                        ? '#bc8cff'
                        : '#8b949e',
              }}
            >
              {TYPE_LABELS[crumb.type] || crumb.type}
            </div>

            {/* 操作描述 */}
            <div className="breadcrumb-message">{crumb.message}</div>

            {/*
              附加数据展示
              如接口请求的 URL、状态码，或点击事件的目标元素
              使用小号等宽字体，灰色
            */}
            {crumb.data && Object.keys(crumb.data).length > 0 && (
              <div
                className="font-mono text-muted"
                style={{ fontSize: '11px', marginTop: '4px' }}
              >
                {Object.entries(crumb.data).map(([key, value]) => (
                  <span key={key} style={{ marginRight: '12px' }}>
                    {key}: {String(value)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

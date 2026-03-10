/**
 * @file 事件时间轴组件
 * @description 录像回放页右侧的事件时间轴，展示录像中的关键事件
 *
 * 功能说明：
 * 1. 从 rrweb 事件数组中提取关键事件（错误、点击、路由变化）
 * 2. 按时间顺序展示在垂直时间轴上
 * 3. 不同类型的事件用不同颜色的圆点标识
 * 4. 点击事件标记可跳转到录像中对应的时刻
 *
 * 事件类型与颜色：
 * - 红色圆点：错误事件（JS Error）
 * - 蓝色圆点：点击事件（用户点击）
 * - 紫色圆点：路由变化（页面导航）
 *
 * 与 Player 组件的协作：
 * - EventTimeline 接收 currentTime（当前播放时间），高亮当前时刻附近的事件
 * - 用户点击事件标记时，调用 onJump 回调，Player 跳转到对应时刻
 *
 * Props:
 * @prop events - rrweb 事件数组（与 Player 组件共享同一数据源）
 * @prop currentTime - 当前播放时间（毫秒偏移，用于高亮当前事件）
 * @prop onJump - 跳转回调，点击事件标记时调用
 */
import { useMemo } from 'react';

/**
 * EventTimeline 组件的 Props 类型
 */
interface EventTimelineProps {
  /**
   * rrweb 事件数组
   * 从中提取关键事件（错误、点击、路由变化）
   */
  events: unknown[];

  /**
   * 当前播放时间（毫秒偏移）
   * 用于高亮时间轴上当前时刻附近的事件
   */
  currentTime: number;

  /**
   * 跳转回调
   * 用户点击时间轴上的事件标记时调用
   * @param timeOffset - 目标时刻的毫秒偏移
   */
  onJump: (timeOffset: number) => void;
}

/**
 * 提取后的时间轴事件
 *
 * @property type - 事件类型：'error' | 'click' | 'navigation'
 * @property label - 事件描述文本
 * @property timeOffset - 相对于录像开始时间的毫秒偏移
 */
interface TimelineEvent {
  type: 'error' | 'click' | 'navigation';
  label: string;
  timeOffset: number;
}

/**
 * 从 rrweb 事件数组中提取关键事件
 *
 * rrweb 事件类型说明（EventType 枚举）：
 * - 0: DomContentLoaded
 * - 1: Load
 * - 2: FullSnapshot（完整 DOM 快照）
 * - 3: IncrementalSnapshot（增量变更）
 * - 4: Meta（元数据）
 * - 5: Custom（自定义事件 — SDK 通过此类型注入错误/点击/路由事件）
 * - 6: Plugin（插件事件）
 *
 * 我们主要关注 type=5 的 Custom 事件和 type=3 中的鼠标点击事件
 *
 * @param events - rrweb 事件数组
 * @returns 提取后的时间轴事件数组
 */
function extractTimelineEvents(events: unknown[]): TimelineEvent[] {
  if (!events || events.length === 0) return [];

  const timelineEvents: TimelineEvent[] = [];

  /**
   * 获取录像的起始时间戳
   * 第一个事件的 timestamp 作为基准点
   */
  const firstEvent = events[0] as { timestamp?: number };
  const baseTimestamp = firstEvent?.timestamp || 0;

  for (const event of events) {
    const evt = event as {
      type?: number;
      timestamp?: number;
      data?: {
        tag?: string;
        payload?: { type?: string; message?: string; url?: string };
        source?: number;
      };
    };

    if (!evt.timestamp) continue;

    const timeOffset = evt.timestamp - baseTimestamp;

    /**
     * 提取 Custom 事件（type=5）
     * SDK 会将错误、点击、路由变化等关键操作作为 Custom 事件注入到 rrweb 录制流中
     */
    if (evt.type === 5 && evt.data?.tag) {
      const tag = evt.data.tag;
      const payload = evt.data.payload;

      if (tag === 'error' || payload?.type === 'error') {
        timelineEvents.push({
          type: 'error',
          label: payload?.message || 'JS Error',
          timeOffset,
        });
      } else if (tag === 'click') {
        timelineEvents.push({
          type: 'click',
          label: payload?.message || '用户点击',
          timeOffset,
        });
      } else if (tag === 'navigation') {
        timelineEvents.push({
          type: 'navigation',
          label: payload?.url || '页面导航',
          timeOffset,
        });
      }
    }

    /**
     * 提取鼠标点击事件（type=3, source=2）
     * rrweb 的 IncrementalSnapshot 中 source=2 表示鼠标交互
     * 这是兜底逻辑，如果 SDK 没有注入 Custom 点击事件，
     * 至少可以从 rrweb 原生事件中提取点击信息
     */
    if (evt.type === 3 && evt.data?.source === 2) {
      timelineEvents.push({
        type: 'click',
        label: '鼠标点击',
        timeOffset,
      });
    }
  }

  return timelineEvents;
}

/**
 * 格式化毫秒偏移为 mm:ss 格式
 *
 * @param ms - 毫秒偏移
 * @returns 格式化后的时间字符串（如 "01:23"）
 */
function formatOffset(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * EventTimeline 事件时间轴组件
 *
 * 渲染逻辑：
 * 1. 从 rrweb 事件数组中提取关键事件（useMemo 缓存）
 * 2. 如果没有关键事件 → 显示"无关键事件"提示
 * 3. 否则渲染垂直时间轴：
 *    - 每个事件显示：颜色圆点 + 时间偏移 + 事件描述
 *    - 当前播放时刻附近的事件高亮显示
 *
 * 交互行为：
 * - 点击事件标记 → 调用 onJump(timeOffset)，Player 跳转到对应时刻
 * - 鼠标悬停 → 行背景色变化
 */
export function EventTimeline({ events, currentTime, onJump }: EventTimelineProps) {
  /**
   * 从 rrweb 事件中提取关键事件
   * useMemo 缓存结果，避免每次渲染都重新解析
   */
  const timelineEvents = useMemo(() => extractTimelineEvents(events), [events]);

  return (
    <div className="event-timeline">
      <div className="event-timeline-title">事件时间轴</div>

      {/* 无关键事件时的提示 */}
      {timelineEvents.length === 0 && (
        <div className="text-muted" style={{ padding: '16px', textAlign: 'center', fontSize: '13px' }}>
          无关键事件
        </div>
      )}

      {/* 事件列表 */}
      {timelineEvents.map((event, index) => {
        /**
         * 判断当前事件是否在播放时刻附近（±2 秒内）
         * 如果是，添加高亮背景
         */
        const isNearCurrent = Math.abs(event.timeOffset - currentTime) < 2000;

        return (
          <div
            key={index}
            className="timeline-item"
            onClick={() => onJump(event.timeOffset)}
            style={{
              backgroundColor: isNearCurrent ? 'rgba(88, 166, 255, 0.1)' : undefined,
            }}
          >
            {/* 颜色圆点：根据事件类型显示不同颜色 */}
            <div className={`timeline-dot ${event.type}`} />

            {/* 时间偏移：mm:ss 格式 */}
            <span className="timeline-time">{formatOffset(event.timeOffset)}</span>

            {/* 事件描述：截断显示 */}
            <span className="timeline-label" title={event.label}>
              {event.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * @file rrweb-player 封装组件
 * @description 封装 rrweb-player 库，提供录像回放功能
 *
 * rrweb-player 是 rrweb 生态的回放组件，能够将 rrweb.record() 录制的事件数组
 * 还原为可视化的页面回放。它本质上是一个"DOM 时间机器"：
 * 1. 读取 FullSnapshot 事件，重建完整的 DOM 树
 * 2. 按时间顺序应用 IncrementalSnapshot 事件（DOM 变更、鼠标移动、滚动等）
 * 3. 在一个 iframe 沙箱中渲染回放画面
 *
 * 本组件的职责：
 * 1. 创建 rrweb-player 实例并挂载到 DOM 容器
 * 2. 响应外部的播放控制（播放/暂停/倍速/跳转）
 * 3. 通过回调通知父组件当前播放时间（用于同步 EventTimeline）
 * 4. 组件卸载时销毁 player 实例，防止内存泄漏
 *
 * Props:
 * @prop events - rrweb 事件数组（从 API 获取的录像数据）
 * @prop speed - 播放倍速（1/2/4/8）
 * @prop isPlaying - 是否正在播放
 * @prop seekTo - 跳转到指定时间（毫秒偏移），由 EventTimeline 的 onJump 触发
 * @prop onTimeUpdate - 播放时间更新回调（用于同步时间轴）
 *
 * 面试讲解要点：
 * - rrweb 的录制原理：MutationObserver 监听 DOM 变更
 * - 回放原理：在 iframe 中重建 DOM 并按时间线应用变更
 * - 隐私保护：maskInputOptions 遮盖敏感输入
 * - 性能优化：Web Worker 压缩录像数据
 */
import { useEffect, useRef, useCallback } from 'react';
import rrwebPlayer from 'rrweb-player';
import 'rrweb-player/dist/style.css';

/**
 * Player 组件的 Props 类型
 */
interface PlayerProps {
  /**
   * rrweb 事件数组
   * 包含 FullSnapshot（完整 DOM 快照）、IncrementalSnapshot（增量变更）、
   * Meta（元数据）等多种事件类型
   */
  events: unknown[];

  /**
   * 播放倍速（1/2/4/8）
   */
  speed: number;

  /**
   * 是否正在播放
   */
  isPlaying: boolean;

  /**
   * 跳转到指定时间（毫秒偏移）
   * 当用户在 EventTimeline 上点击某个事件标记时，
   * 父组件会更新此值，Player 响应并跳转到对应时刻
   */
  seekTo?: number;

  /**
   * 播放时间更新回调
   * 传入当前播放时间（相对于录像开始的毫秒偏移）
   */
  onTimeUpdate?: (time: number) => void;
}

/**
 * Player 组件 — rrweb-player 封装
 *
 * rrweb-player v2 alpha 基于 Svelte 构建，在 React 中使用时需要注意：
 * - 通过 new rrwebPlayer({ target, props }) 实例化（Svelte 组件的标准方式）
 * - 播放控制通过 getReplayer() 获取底层 Replayer 实例来操作
 * - 销毁通过 $destroy() 方法
 */
export function Player({ events, speed, isPlaying, seekTo, onTimeUpdate }: PlayerProps) {
  /** DOM 容器引用 */
  const containerRef = useRef<HTMLDivElement>(null);

  /** rrweb-player 实例引用 */
  const playerRef = useRef<rrwebPlayer | null>(null);

  /** 记录录像的起始时间戳，用于计算相对播放时间 */
  const startTimeRef = useRef<number>(0);

  /**
   * 获取底层 Replayer 实例
   * rrweb-player 的 getReplayer() 方法返回底层的 Replayer 对象，
   * 提供 play/pause/setConfig 等细粒度控制方法
   */
  const getReplayer = useCallback(() => {
    try {
      return playerRef.current?.getReplayer?.() ?? null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Effect: 创建/销毁 rrweb-player 实例
   * 当 events 数组变化时（加载了新的录像数据），重新创建 player
   */
  useEffect(() => {
    if (!containerRef.current || !events || events.length === 0) return;

    containerRef.current.innerHTML = '';

    try {
      /**
       * 记录录像起始时间戳
       * rrweb 事件的 timestamp 是绝对毫秒时间戳，
       * 需要减去起始时间才能得到相对播放时间
       */
      const firstEvent = events[0] as { timestamp?: number };
      startTimeRef.current = firstEvent?.timestamp ?? 0;

      playerRef.current = new rrwebPlayer({
        target: containerRef.current,
        props: {
          events: events as any[],
          width: 1024,
          height: 576,
          autoPlay: false,
          speedOption: [1, 2, 4, 8],
          showController: false,
        },
      });
    } catch (err) {
      console.error('[OmniSight Player] 创建 rrweb-player 实例失败:', err);
    }

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.$destroy();
        } catch {
          /* 忽略销毁时的错误 */
        }
        playerRef.current = null;
      }
    };
  }, [events]);

  /**
   * Effect: 响应倍速变化
   * 通过 getReplayer().setConfig({ speed }) 设置播放速度
   * 这是 rrweb Replayer 的标准 API
   */
  useEffect(() => {
    const replayer = getReplayer();
    if (replayer) {
      try {
        replayer.setConfig({ speed });
      } catch {
        /* 忽略 */
      }
    }
  }, [speed, getReplayer]);

  /**
   * Effect: 响应播放/暂停状态变化
   * 通过 getReplayer().play() / getReplayer().pause() 控制播放
   */
  useEffect(() => {
    const replayer = getReplayer();
    if (replayer) {
      try {
        if (isPlaying) {
          replayer.play();
        } else {
          replayer.pause();
        }
      } catch {
        /* 忽略 */
      }
    }
  }, [isPlaying, getReplayer]);

  /**
   * Effect: 响应 seekTo 跳转请求
   * 当用户在 EventTimeline 上点击某个事件标记时，
   * seekTo 会被更新为对应的时间偏移，Player 跳转到该时刻
   *
   * getReplayer().play(timeOffset) 会从指定的时间偏移开始播放
   */
  useEffect(() => {
    if (seekTo === undefined || seekTo === null) return;
    const replayer = getReplayer();
    if (replayer) {
      try {
        replayer.play(seekTo);
        if (!isPlaying) {
          replayer.pause(seekTo);
        }
      } catch {
        /* 忽略 */
      }
    }
  }, [seekTo, getReplayer, isPlaying]);

  /**
   * Effect: 设置时间更新轮询
   * 通过 getReplayer().getCurrentTime() 获取当前播放进度
   * 每 200ms 轮询一次，将当前时间通知父组件
   */
  useEffect(() => {
    if (!onTimeUpdate) return;

    const timer = setInterval(() => {
      const replayer = getReplayer();
      if (replayer) {
        try {
          const currentTime = replayer.getCurrentTime?.();
          if (typeof currentTime === 'number') {
            onTimeUpdate(currentTime);
          }
        } catch {
          /* 忽略 */
        }
      }
    }, 200);

    return () => clearInterval(timer);
  }, [onTimeUpdate, getReplayer]);

  return (
    <div className="replay-player-container">
      {events && events.length > 0 ? (
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      ) : (
        <div className="text-muted" style={{ padding: '40px' }}>
          无录像数据
        </div>
      )}
    </div>
  );
}

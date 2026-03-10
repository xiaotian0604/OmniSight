/**
 * @file 录像回放数据加载与播放状态管理 Hook
 * @description 封装 rrweb 录像数据的加载逻辑和播放器状态管理
 *
 * 核心功能：
 * 1. 根据 sessionId 加载录像数据（使用 React Query 缓存）
 * 2. 管理播放状态（播放/暂停/倍速/当前时间）
 * 3. 提供跳转到指定时刻的方法（用于时间轴点击跳转）
 *
 * 数据流向：
 *   useReplay hook → getReplayBySessionId API → Gateway → replay_sessions 表
 *   ↓
 *   返回 events 数组 → 传给 rrweb-player 组件渲染回放
 *
 * 使用方式：
 *   const { replayData, isLoading, playbackState, setSpeed, togglePlay } = useReplay(sessionId);
 *   // replayData.events → 传给 Player 组件
 *   // playbackState.speed → 当前倍速
 */
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getReplayBySessionId } from '@/api/replay';
import type { ReplayDetail } from '@/api/replay';

/* ================================================================
   类型定义
   ================================================================ */

/**
 * 播放状态
 *
 * @property isPlaying - 是否正在播放
 * @property speed - 当前播放倍速（1x/2x/4x/8x）
 * @property currentTime - 当前播放时间（相对于录像开始的毫秒偏移）
 */
export interface PlaybackState {
  isPlaying: boolean;
  speed: number;
  currentTime: number;
}

/**
 * useReplay Hook 的返回值类型
 *
 * @property replayData - 录像详情数据（包含 events 数组），加载中时为 undefined
 * @property isLoading - 数据是否正在加载
 * @property isError - 是否加载失败
 * @property error - 错误对象（加载失败时）
 * @property playbackState - 当前播放状态
 * @property setSpeed - 设置播放倍速
 * @property togglePlay - 切换播放/暂停
 * @property seekTo - 跳转到指定时刻（毫秒偏移）
 * @property setCurrentTime - 更新当前播放时间（由 Player 组件回调）
 */
export interface UseReplayReturn {
  replayData: ReplayDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  playbackState: PlaybackState;
  /** 跳转目标时间（毫秒偏移），每次 seekTo 调用时递增序号以触发 Player effect */
  seekTarget: { time: number; seq: number } | null;
  setSpeed: (speed: number) => void;
  togglePlay: () => void;
  seekTo: (timeOffset: number) => void;
  setCurrentTime: (time: number) => void;
}

/* ================================================================
   Hook 实现
   ================================================================ */

/**
 * 录像回放数据加载与播放状态管理 Hook
 *
 * @param sessionId - 要加载的录像 session ID
 *                    对应 replay_sessions 表的 session_id 字段
 *                    通常从路由参数 useParams() 获取
 *
 * @returns UseReplayReturn 对象，包含数据、加载状态和播放控制方法
 *
 * 内部实现：
 * 1. 使用 React Query 的 useQuery 加载录像数据
 *    - queryKey: ['replay', sessionId]，sessionId 变化时自动重新加载
 *    - staleTime: 5 分钟（录像数据不会变化，可以缓存较长时间）
 *    - enabled: 仅在 sessionId 存在时才发起请求
 *
 * 2. 使用 useState 管理播放状态
 *    - 播放状态与数据加载解耦，播放控制不会触发数据重新请求
 *    - Player 组件通过 setCurrentTime 回调同步当前播放进度
 */
export function useReplay(sessionId: string): UseReplayReturn {
  /**
   * 播放状态
   * 初始状态：暂停、1 倍速、时间 0
   */
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    speed: 1,
    currentTime: 0,
  });

  /**
   * 跳转目标状态
   * 使用 seq（序号）确保即使跳转到相同时间也能触发 Player 的 useEffect
   */
  const [seekTarget, setSeekTarget] = useState<{ time: number; seq: number } | null>(null);

  /**
   * 使用 React Query 加载录像数据
   *
   * 配置说明：
   * - staleTime: 5 分钟 — 录像数据一旦上传就不会变化，可以缓存较长时间
   * - enabled: sessionId 存在时才请求 — 防止空 sessionId 导致无效请求
   * - queryKey 包含 sessionId — 切换录像时自动加载新数据
   */
  const {
    data: replayData,
    isLoading,
    isError,
    error,
  } = useQuery<ReplayDetail>({
    queryKey: ['replay', sessionId],
    queryFn: () => getReplayBySessionId(sessionId),
    staleTime: 5 * 60 * 1000,
    enabled: !!sessionId,
  });

  /**
   * 设置播放倍速
   *
   * rrweb-player 支持的倍速选项：1, 2, 4, 8
   * 高倍速用于快速浏览录像，定位到关键时刻后切回 1x 仔细查看
   *
   * @param speed - 目标倍速
   */
  const setSpeed = useCallback((speed: number) => {
    setPlaybackState((prev) => ({ ...prev, speed }));
  }, []);

  /**
   * 切换播放/暂停状态
   * 如果当前正在播放则暂停，反之则开始播放
   */
  const togglePlay = useCallback(() => {
    setPlaybackState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  /**
   * 跳转到指定时刻
   *
   * 使用场景：
   * - 用户点击右侧 EventTimeline 上的错误/点击标记
   * - 跳转到对应时刻查看当时的页面状态
   *
   * @param timeOffset - 相对于录像开始时间的毫秒偏移
   */
  const seekTo = useCallback((timeOffset: number) => {
    setPlaybackState((prev) => ({ ...prev, currentTime: timeOffset }));
    setSeekTarget((prev) => ({ time: timeOffset, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  /**
   * 更新当前播放时间
   *
   * 由 rrweb-player 的时间更新回调调用，
   * 用于同步 EventTimeline 组件中的当前时间指示器
   *
   * @param time - 当前播放时间（毫秒偏移）
   */
  const setCurrentTime = useCallback((time: number) => {
    setPlaybackState((prev) => ({ ...prev, currentTime: time }));
  }, []);

  return {
    replayData,
    isLoading,
    isError,
    error: error as Error | null,
    playbackState,
    seekTarget,
    setSpeed,
    togglePlay,
    seekTo,
    setCurrentTime,
  };
}

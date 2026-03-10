/**
 * @file 录像回放页面容器
 * @description 录像回放的顶层页面组件，组合 Player 和 EventTimeline
 *
 * 页面布局：
 * ┌──────────────────────────────────────────────────────┐
 * │  返回按钮  |  Session ID  |  播放控制（倍速/暂停）    │
 * ├────────────────────────────┬─────────────────────────┤
 * │                            │                         │
 * │    Player                  │    EventTimeline        │
 * │    (rrweb-player 回放区)   │    (右侧事件时间轴)     │
 * │                            │                         │
 * │    宽度自适应              │    固定宽度 300px        │
 * │                            │                         │
 * └────────────────────────────┴─────────────────────────┘
 *
 * 路由参数：
 *   /replay/player/:sessionId — sessionId 为录像的会话 ID
 *
 * 数据来源：
 *   useReplay hook → getReplayBySessionId API → GET /v1/replay/:sessionId
 *   返回完整的 rrweb 事件数组
 *
 * 组件协作：
 * - Player: 封装 rrweb-player，负责渲染回放画面
 * - EventTimeline: 展示录像中的关键事件（错误/点击/路由），点击可跳转
 * - useReplay hook: 管理数据加载和播放状态，作为两个子组件的数据桥梁
 *
 * 面试演示要点：
 * - 这是整个项目最震撼的演示点
 * - 能够"像素级还原"用户遇到 Bug 时的操作场景
 * - 时间轴上的错误标记可以快速定位到错误发生的时刻
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useReplay } from '@/hooks/useReplay';
import { Player } from './Player';
import { EventTimeline } from './EventTimeline';
import { EmptyState } from '@/components/EmptyState';

/**
 * 录像回放页面容器组件
 *
 * 渲染逻辑：
 * 1. 从 URL 参数获取 sessionId
 * 2. 调用 useReplay hook 加载录像数据和管理播放状态
 * 3. 顶部：返回按钮 + Session 信息 + 播放控制
 * 4. 主体：左侧 Player（回放区）+ 右侧 EventTimeline（事件时间轴）
 *
 * 交互行为：
 * - 点击返回按钮 → 导航回录像列表页
 * - 点击倍速按钮 → 切换播放速度（1x/2x/4x/8x）
 * - 点击 EventTimeline 中的事件标记 → Player 跳转到对应时刻
 */
export default function ReplayPlayerPage() {
  /**
   * 从路由参数获取 sessionId
   * 对应路由配置：<Route path="/replay/player/:sessionId" />
   */
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  /**
   * 使用 useReplay hook 管理录像数据和播放状态
   *
   * 返回值：
   * - replayData: 录像详情（含 events 数组）
   * - isLoading: 数据加载中
   * - playbackState: 播放状态（isPlaying, speed, currentTime）
   * - setSpeed: 设置倍速
   * - togglePlay: 切换播放/暂停
   * - seekTo: 跳转到指定时刻
   * - setCurrentTime: 更新当前时间（Player 回调）
   */
  const {
    replayData,
    isLoading,
    isError,
    playbackState,
    seekTarget,
    setSpeed,
    togglePlay,
    seekTo,
    setCurrentTime,
  } = useReplay(sessionId || '');

  /* 加载状态 */
  if (isLoading) {
    return (
      <div className="text-muted" style={{ padding: '40px', textAlign: 'center' }}>
        加载录像数据...
      </div>
    );
  }

  /* 错误状态 */
  if (isError || !replayData) {
    return (
      <EmptyState
        icon="🎬"
        title="无法加载录像"
        description="请检查网络连接或确认该录像是否存在"
        action={{ label: '返回列表', onClick: () => navigate('/replay') }}
      />
    );
  }

  /**
   * 倍速选项
   * rrweb-player 支持 1x/2x/4x/8x 倍速
   * 高倍速用于快速浏览，定位到关键时刻后切回 1x
   */
  const speedOptions = [1, 2, 4, 8];

  return (
    <div>
      {/* ==================== 顶部控制栏 ==================== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* 返回按钮 */}
          <button className="btn btn-sm" onClick={() => navigate('/replay')} type="button">
            ← 返回列表
          </button>

          {/* Session 信息 */}
          <span className="font-mono text-muted" style={{ fontSize: '12px' }}>
            Session: {sessionId}
          </span>
        </div>

        {/* 播放控制 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* 播放/暂停按钮 */}
          <button className="btn btn-sm" onClick={togglePlay} type="button">
            {playbackState.isPlaying ? '⏸ 暂停' : '▶ 播放'}
          </button>

          {/* 倍速选择 */}
          <div className="time-range-picker">
            {speedOptions.map((speed) => (
              <button
                key={speed}
                className={`time-range-option ${playbackState.speed === speed ? 'active' : ''}`}
                onClick={() => setSpeed(speed)}
                type="button"
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ==================== 主体区域：Player + EventTimeline ==================== */}
      <div className="replay-page">
        {/* 左侧：rrweb-player 回放区域 */}
        <Player
          events={replayData.events}
          speed={playbackState.speed}
          isPlaying={playbackState.isPlaying}
          seekTo={seekTarget?.time}
          onTimeUpdate={setCurrentTime}
        />

        {/* 右侧：事件时间轴 */}
        <EventTimeline
          events={replayData.events}
          currentTime={playbackState.currentTime}
          onJump={seekTo}
        />
      </div>
    </div>
  );
}

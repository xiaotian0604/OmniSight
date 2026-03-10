/**
 * @file 关联录像跳转组件
 * @description 在错误详情页中展示关联的录像信息，并提供跳转到回放页的按钮
 *
 * 功能说明：
 * 当错误发生时，如果 SDK 开启了 rrweb 录制功能，
 * 会在错误触发后上传错误前后的录像片段（前 30s + 后 10s）。
 * 这条录像与错误事件通过 session_id 关联。
 *
 * 本组件展示关联录像的 session_id，并提供一个按钮跳转到录像回放页面。
 * 这是 OmniSight 最有价值的功能之一 — 能够"像素级还原"用户遇到 Bug 时的操作场景。
 *
 * Props:
 * @prop sessionId - 关联的录像 session ID
 *
 * 交互行为：
 * - 点击"查看录像"按钮 → 导航到 /replay/player/:sessionId
 * - 在录像回放页可以看到错误发生时的完整用户操作
 */
import { useNavigate } from 'react-router-dom';

/**
 * ReplayLink 组件的 Props 类型
 */
interface ReplayLinkProps {
  /**
   * 关联的录像 session ID
   * 对应 replay_sessions 表的 session_id 字段
   * 通过此 ID 可以加载完整的 rrweb 录像数据
   */
  sessionId: string;
}

/**
 * ReplayLink 关联录像跳转组件
 *
 * 渲染逻辑：
 * 1. 显示录像图标和提示文本
 * 2. 显示 session_id（等宽字体，便于复制）
 * 3. 显示"查看录像"按钮
 *
 * 点击按钮后：
 * - 使用 react-router 的 navigate 跳转到 /replay/player/:sessionId
 * - 录像回放页会自动加载该 session 的 rrweb 事件数据并渲染回放
 *
 * 面试讲解要点：
 * - 错误与录像的关联是通过 session_id 实现的
 * - SDK 端在错误发生时，将当前 session_id 附加到错误事件中
 * - 同时将 Ring Buffer 中的录像数据上传到 /v1/replay
 * - 控制台查看错误详情时，通过 session_id 找到对应的录像
 */
export function ReplayLink({ sessionId }: ReplayLinkProps) {
  const navigate = useNavigate();

  /**
   * 处理"查看录像"按钮点击
   * 导航到录像回放页面
   */
  const handleClick = () => {
    navigate(`/replay/player/${sessionId}`);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* 录像图标 */}
        <span style={{ fontSize: '24px' }}>🎬</span>

        <div>
          {/* 提示文本 */}
          <div style={{ fontSize: '13px', color: '#e6edf3', marginBottom: '4px' }}>
            该错误有关联的用户操作录像
          </div>

          {/* Session ID：等宽字体，便于复制和识别 */}
          <div className="font-mono text-muted" style={{ fontSize: '12px' }}>
            Session: {sessionId}
          </div>
        </div>
      </div>

      {/* 查看录像按钮 */}
      <button className="btn btn-primary" onClick={handleClick} type="button">
        查看录像 →
      </button>
    </div>
  );
}

/**
 * @file 录像列表页面
 * @description 展示所有 rrweb 录像的列表，支持按时间筛选和分页
 *
 * 页面功能：
 * 1. 展示录像列表，每条记录显示 session_id、创建时间、关联错误数、录像时长
 * 2. 点击任意行跳转到录像回放页面
 * 3. 受全局 timeRange 约束，时间范围变更时自动刷新
 *
 * 数据来源：
 *   useQuery → getReplayList API → GET /v1/replay
 *   返回 ReplaySession[] 数组
 *
 * 录像产生条件（面试重点）：
 * SDK 采用"错误窗口"策略，并非所有用户操作都会被录制上传：
 * 1. rrweb.record() 始终在后台录制，数据存入 Ring Buffer（保留最近 30s）
 * 2. 当 JS 错误发生时，触发上传逻辑
 * 3. 继续录制 10s（捕获错误后的用户反应）
 * 4. 将 Ring Buffer 中的 30s + 后续 10s 共约 40s 的录像数据上传
 * 5. 如果没有错误发生，录像数据不会上传，大幅节省存储成本
 *
 * 这意味着录像列表中的每条记录都至少关联了一个错误
 */
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getReplayList } from '@/api/replay';
import type { ReplaySession } from '@/api/replay';
import { useGlobalStore } from '@/store/global.store';
import { EmptyState } from '@/components/EmptyState';

/**
 * 格式化录像时长
 * 将毫秒转换为人类可读的格式
 *
 * @param ms - 时长（毫秒）
 * @returns 格式化后的时长字符串（如 "35s"、"1m 20s"）
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * 录像列表页面组件
 *
 * 渲染逻辑：
 * 1. 页面标题 + 描述
 * 2. 加载状态 / 空状态 / 录像列表表格
 *
 * 交互行为：
 * - 点击表格行 → 导航到 /replay/player/:sessionId
 * - 错误数量 > 0 时用红色徽章标识
 */
export default function ReplayPage() {
  const navigate = useNavigate();
  const { timeRange } = useGlobalStore();

  /**
   * 请求录像列表
   *
   * queryKey 包含 timeRange，时间范围变化时自动重新请求
   */
  const { data: sessions, isLoading } = useQuery<ReplaySession[]>({
    queryKey: [
      'replay-list',
      timeRange.start.toISOString(),
      timeRange.end.toISOString(),
    ],
    queryFn: () =>
      getReplayList({
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
        limit: 50,
      }),
  });

  return (
    <div>
      {/* 页面标题 */}
      <div className="page-header">
        <div className="page-header-info">
          <h2>行为回放</h2>
          <p>用户操作录像列表，点击查看 rrweb 回放（仅在错误发生时录制上传）</p>
        </div>
      </div>

      {/* 加载状态 */}
      {isLoading && (
        <div className="text-muted" style={{ padding: '40px', textAlign: 'center' }}>
          加载中...
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && (!sessions || sessions.length === 0) && (
        <EmptyState
          icon="🎬"
          title="暂无录像"
          description="选定时间范围内没有录像数据。录像仅在错误发生时自动上传。"
        />
      )}

      {/* 录像列表表格 */}
      {!isLoading && sessions && sessions.length > 0 && (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>创建时间</th>
                  <th style={{ textAlign: 'right' }}>关联错误</th>
                  <th style={{ textAlign: 'right' }}>时长</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr
                    key={session.sessionId}
                    className="clickable"
                    onClick={() => navigate(`/replay/player/${session.sessionId}`)}
                  >
                    {/*
                      Session ID 列
                      使用等宽字体，截断显示（UUID 较长）
                      hover 时 title 显示完整 ID
                    */}
                    <td>
                      <span
                        className="font-mono truncate"
                        style={{ maxWidth: '300px', display: 'inline-block', fontSize: '12px' }}
                        title={session.sessionId}
                      >
                        {session.sessionId}
                      </span>
                    </td>

                    {/* 创建时间 */}
                    <td className="text-muted" style={{ fontSize: '13px' }}>
                      {new Date(session.createdAt).toLocaleString('zh-CN')}
                    </td>

                    {/*
                      关联错误数
                      使用红色徽章标识，数字越大越醒目
                    */}
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge badge-error">
                        {session.errorCount} 个错误
                      </span>
                    </td>

                    {/* 录像时长 */}
                    <td style={{ textAlign: 'right' }} className="text-muted">
                      {session.duration ? formatDuration(session.duration) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

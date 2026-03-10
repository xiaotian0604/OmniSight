/**
 * @file 错误详情页面
 * @description 展示单个错误的完整详情，包括堆栈、面包屑和关联录像
 *
 * 页面布局：
 * ┌─────────────────────────────────────────────────┐
 * │  返回按钮  |  错误消息标题                        │
 * │  统计信息：发生次数 | 影响用户 | 首次/最后发生      │
 * ├─────────────────────────────────────────────────┤
 * │  ┌─────────────────────────────────────────┐    │
 * │  │  StackTrace — 还原后的堆栈信息           │    │
 * │  └─────────────────────────────────────────┘    │
 * │                                                 │
 * │  ┌─────────────────────────────────────────┐    │
 * │  │  Breadcrumbs — 错误前的用户操作面包屑     │    │
 * │  └─────────────────────────────────────────┘    │
 * │                                                 │
 * │  ┌─────────────────────────────────────────┐    │
 * │  │  ReplayLink — 跳转到关联录像             │    │
 * │  └─────────────────────────────────────────┘    │
 * └─────────────────────────────────────────────────┘
 *
 * 路由参数：
 *   /errors/:fingerprint — fingerprint 为错误指纹（hash 值）
 *
 * 数据来源：
 *   useQuery → getErrorDetail API → GET /v1/errors/:fingerprint
 *
 * 面试讲解要点：
 * - SourceMap 还原：后端读取上传的 .map 文件，将压缩后的行列号还原为源码位置
 * - 面包屑：SDK 在采集错误时，同时记录错误前的用户操作轨迹
 * - 录像关联：通过 session_id 将错误与 rrweb 录像关联
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getErrorDetail } from '@/api/errors';
import type { ErrorDetail } from '@/api/errors';
import { StackTrace } from './StackTrace';
import { Breadcrumbs } from './Breadcrumbs';
import { ReplayLink } from './ReplayLink';
import { EmptyState } from '@/components/EmptyState';

/**
 * 错误详情页面组件
 *
 * 渲染逻辑：
 * 1. 从 URL 参数中获取 fingerprint
 * 2. 使用 React Query 请求错误详情数据
 * 3. 页面顶部：返回按钮 + 错误消息 + 统计信息
 * 4. 主体区域：StackTrace + Breadcrumbs + ReplayLink 三个子组件
 *
 * 交互行为：
 * - 点击返回按钮 → 导航回错误列表页
 * - StackTrace 中的文件路径可展开查看源码上下文
 * - ReplayLink 点击 → 跳转到关联的录像回放页
 */
export default function ErrorDetailPage() {
  /**
   * 从路由参数中获取错误指纹
   * 对应路由配置：<Route path="/errors/:fingerprint" />
   */
  const { fingerprint } = useParams<{ fingerprint: string }>();
  const navigate = useNavigate();

  /**
   * 请求错误详情数据
   *
   * queryKey: ['error-detail', fingerprint]
   *   fingerprint 变化时自动重新请求（虽然通常不会在同一页面内变化）
   *
   * enabled: 仅在 fingerprint 存在时请求
   *   防止 URL 参数缺失时发起无效请求
   */
  const { data: detail, isLoading, isError } = useQuery<ErrorDetail>({
    queryKey: ['error-detail', fingerprint],
    queryFn: () => getErrorDetail(fingerprint!),
    enabled: !!fingerprint,
  });

  /* 加载状态 */
  if (isLoading) {
    return (
      <div className="text-muted" style={{ padding: '40px', textAlign: 'center' }}>
        加载错误详情...
      </div>
    );
  }

  /* 错误状态 */
  if (isError || !detail) {
    return (
      <EmptyState
        icon="❌"
        title="无法加载错误详情"
        description="请检查网络连接或稍后重试"
        action={{ label: '返回列表', onClick: () => navigate('/errors') }}
      />
    );
  }

  return (
    <div>
      {/* ==================== 页面顶部：返回按钮 + 错误概要 ==================== */}
      <div style={{ marginBottom: '24px' }}>
        {/* 返回按钮 */}
        <button
          className="btn btn-sm"
          onClick={() => navigate('/errors')}
          style={{ marginBottom: '16px' }}
          type="button"
        >
          ← 返回错误列表
        </button>

        {/* 错误消息标题 */}
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', wordBreak: 'break-word' }}>
          {detail.message}
        </h2>

        {/* 统计信息行 */}
        <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: '#8b949e' }}>
          <span>
            发生 <strong className="text-error">{detail.count.toLocaleString()}</strong> 次
          </span>
          <span>
            影响 <strong>{detail.affectedUsers.toLocaleString()}</strong> 位用户
          </span>
          <span>
            首次发生: {new Date(detail.firstSeen).toLocaleString('zh-CN')}
          </span>
          <span>
            最近发生: {new Date(detail.lastSeen).toLocaleString('zh-CN')}
          </span>
        </div>

        {/* 环境标签 */}
        {detail.tags && Object.keys(detail.tags).length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            {Object.entries(detail.tags).map(([key, value]) => (
              <span key={key} className="badge badge-info">
                {key}: {value}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ==================== 堆栈信息 ==================== */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">堆栈信息</span>
          <span className="card-subtitle">
            {detail.filename ? `${detail.filename}:${detail.lineno}:${detail.colno}` : '未知位置'}
          </span>
        </div>
        <StackTrace stack={detail.stack} />
      </div>

      {/* ==================== 用户操作面包屑 ==================== */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">用户操作轨迹</span>
          <span className="card-subtitle">错误发生前的用户操作记录</span>
        </div>
        <Breadcrumbs breadcrumbs={detail.breadcrumbs} />
      </div>

      {/* ==================== 关联录像链接 ==================== */}
      {detail.replaySessionId && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">关联录像</span>
            <span className="card-subtitle">查看错误发生时的用户操作录像</span>
          </div>
          <ReplayLink sessionId={detail.replaySessionId} />
        </div>
      )}
    </div>
  );
}

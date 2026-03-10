/**
 * @file 错误聚合列表页面
 * @description 展示按指纹分组的错误聚合列表，是错误管理的入口页面
 *
 * 页面功能：
 * 1. 展示所有错误的聚合列表（按指纹分组）
 * 2. 每组显示：错误消息、发生次数、影响用户数、首次/最后发生时间
 * 3. 支持按频次或最近发生时间排序
 * 4. 点击任意行跳转到错误详情页
 *
 * 数据来源：
 *   useQuery → getErrors API → GET /v1/errors
 *   受全局 timeRange 约束，时间范围变更时自动刷新
 *
 * 与 TopErrors 组件的区别：
 * - TopErrors 只显示 Top 10，嵌入在概览页中
 * - 本页面显示完整列表（分页），支持更多筛选和排序选项
 *
 * 面试讲解要点：
 * - 错误聚合的核心是 fingerprint（指纹），由 SDK 端生成
 * - 指纹算法：hash(message + stack 第一帧)
 * - 后端使用 GROUP BY fingerprint 进行聚合查询
 * - 影响用户数通过 COUNT(DISTINCT session_id) 计算
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getErrors } from '@/api/errors';
import type { ErrorGroup } from '@/api/errors';
import { useGlobalStore } from '@/store/global.store';
import { EmptyState } from '@/components/EmptyState';

/**
 * 错误列表页面组件
 *
 * 渲染逻辑：
 * 1. 页面标题 + 排序控制
 * 2. 错误列表表格（或空状态/加载状态）
 *
 * 状态管理：
 * - sortBy: 排序方式（count/lastSeen），本地 state
 * - timeRange: 全局 store
 * - 错误数据: React Query 缓存
 */
export default function ErrorsPage() {
  const navigate = useNavigate();
  const { timeRange } = useGlobalStore();

  /**
   * 排序方式
   * - 'count': 按发生频次降序（默认，关注最频繁的错误）
   * - 'lastSeen': 按最近发生时间降序（关注最新出现的错误）
   */
  const [sortBy, setSortBy] = useState<'count' | 'lastSeen'>('count');

  /**
   * 请求错误列表数据
   *
   * queryKey 包含 timeRange 和 sortBy，任一变化都会触发重新请求
   * limit: 50 — 单页最多显示 50 条
   */
  const { data: errors, isLoading } = useQuery<ErrorGroup[]>({
    queryKey: [
      'errors-list',
      timeRange.start.toISOString(),
      timeRange.end.toISOString(),
      sortBy,
    ],
    queryFn: () =>
      getErrors({
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
        limit: 50,
        sort: sortBy,
      }),
  });

  /**
   * 格式化时间为本地化字符串
   * @param isoString - ISO 8601 时间字符串
   * @returns 本地化的日期时间字符串（如 "2024/1/15 14:30:00"）
   */
  const formatTime = (isoString: string): string => {
    return new Date(isoString).toLocaleString('zh-CN');
  };

  return (
    <div>
      {/* 页面标题 + 排序控制 */}
      <div className="page-header">
        <div className="page-header-info">
          <h2>错误管理</h2>
          <p>按指纹聚合的错误列表，点击查看详情和堆栈信息</p>
        </div>

        {/* 排序切换按钮组 */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn btn-sm ${sortBy === 'count' ? 'btn-primary' : ''}`}
            onClick={() => setSortBy('count')}
            type="button"
          >
            按频次
          </button>
          <button
            className={`btn btn-sm ${sortBy === 'lastSeen' ? 'btn-primary' : ''}`}
            onClick={() => setSortBy('lastSeen')}
            type="button"
          >
            按时间
          </button>
        </div>
      </div>

      {/* 加载状态 */}
      {isLoading && (
        <div className="text-muted" style={{ padding: '40px', textAlign: 'center' }}>
          加载中...
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && (!errors || errors.length === 0) && (
        <EmptyState
          icon="✅"
          title="暂无错误"
          description="选定时间范围内没有捕获到错误，系统运行正常"
        />
      )}

      {/* 错误列表表格 */}
      {!isLoading && errors && errors.length > 0 && (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>错误消息</th>
                  <th>文件</th>
                  <th style={{ textAlign: 'right' }}>次数</th>
                  <th style={{ textAlign: 'right' }}>影响用户</th>
                  <th>首次发生</th>
                  <th>最近发生</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((error) => (
                  <tr
                    key={error.fingerprint}
                    className="clickable"
                    onClick={() => navigate(`/errors/${error.fingerprint}`)}
                  >
                    {/* 错误消息：截断显示，hover 时 title 显示完整内容 */}
                    <td>
                      <span
                        className="truncate"
                        style={{ maxWidth: '350px', display: 'inline-block' }}
                        title={error.message}
                      >
                        {error.message}
                      </span>
                    </td>

                    {/* 文件名 */}
                    <td className="font-mono text-muted" style={{ fontSize: '12px' }}>
                      {error.filename || '-'}
                    </td>

                    {/* 发生次数：高频错误用红色强调 */}
                    <td style={{ textAlign: 'right' }}>
                      <span className={error.count > 100 ? 'text-error' : ''}>
                        {error.count.toLocaleString()}
                      </span>
                    </td>

                    {/* 影响用户数 */}
                    <td style={{ textAlign: 'right' }}>
                      {error.affectedUsers.toLocaleString()}
                    </td>

                    {/* 首次发生时间 */}
                    <td className="text-muted" style={{ fontSize: '12px' }}>
                      {formatTime(error.firstSeen)}
                    </td>

                    {/* 最近发生时间 */}
                    <td className="text-muted" style={{ fontSize: '12px' }}>
                      {formatTime(error.lastSeen)}
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

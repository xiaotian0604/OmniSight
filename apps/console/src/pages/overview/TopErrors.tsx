/**
 * @file Top 10 高频错误列表组件
 * @description 展示发生频次最高的 10 个错误，点击可跳转到错误详情页
 *
 * 数据来源：
 *   useQuery → getErrors API → GET /v1/errors?limit=10&sort=count
 *   返回按频次降序排列的错误聚合列表
 *
 * 表格列说明：
 * - 错误消息 (message): 错误的描述文本，截断显示
 * - 文件名 (filename): 发生错误的源文件
 * - 发生次数 (count): 在时间范围内的总发生次数
 * - 影响用户 (affectedUsers): 受影响的独立用户数
 * - 最近发生 (lastSeen): 最后一次发生的时间
 *
 * 交互行为：
 * - 点击表格行 → 使用 react-router 导航到 /errors/:fingerprint 详情页
 * - 鼠标悬停 → 行背景色变化，提示可点击
 *
 * 面试讲解要点：
 * - 错误聚合是通过 fingerprint（指纹）实现的
 * - 指纹 = hash(message + stack 第一帧)，相同错误会被归为一组
 * - 影响用户数通过 COUNT(DISTINCT session_id) 计算
 */
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getErrors } from '@/api/errors';
import type { ErrorGroup } from '@/api/errors';
import { useGlobalStore } from '@/store/global.store';
import { EmptyState } from '@/components/EmptyState';

/**
 * TopErrors 组件
 *
 * 渲染逻辑：
 * 1. 从全局 store 获取 timeRange
 * 2. 使用 React Query 请求 Top 10 错误数据
 * 3. 加载中 → 显示加载提示
 * 4. 无数据 → 显示 EmptyState 组件
 * 5. 有数据 → 渲染表格，每行显示一个错误聚合组
 *
 * 点击行为：
 * 点击任意行 → navigate(`/errors/${fingerprint}`)
 * 跳转到该错误的详情页，展示堆栈、面包屑和关联录像
 */
export function TopErrors() {
  /** react-router 的编程式导航 hook */
  const navigate = useNavigate();

  /** 从全局 store 读取时间范围 */
  const { timeRange } = useGlobalStore();

  /**
   * 使用 React Query 请求错误列表
   *
   * queryKey: ['top-errors', start, end]
   *   - 时间范围变化时自动重新请求
   *
   * 请求参数：
   * - limit: 10 — 只取前 10 条
   * - sort: 'count' — 按发生频次降序排列
   */
  const { data: errors, isLoading } = useQuery<ErrorGroup[]>({
    queryKey: [
      'top-errors',
      timeRange.start.toISOString(),
      timeRange.end.toISOString(),
    ],
    queryFn: () =>
      getErrors({
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
        limit: 10,
        sort: 'count',
      }),
  });

  /**
   * 处理表格行点击
   * 导航到错误详情页，URL 中携带 fingerprint 参数
   *
   * @param fingerprint - 错误指纹（hash 值）
   */
  const handleRowClick = (fingerprint: string) => {
    navigate(`/errors/${fingerprint}`);
  };

  /**
   * 格式化相对时间
   * 将 ISO 时间字符串转换为"x 分钟前"、"x 小时前"等相对时间描述
   *
   * @param isoString - ISO 8601 格式的时间字符串
   * @returns 相对时间描述
   */
  const formatRelativeTime = (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  };

  /* 加载状态 */
  if (isLoading) {
    return <div className="text-muted" style={{ padding: '20px', textAlign: 'center' }}>加载中...</div>;
  }

  /* 空状态 */
  if (!errors || errors.length === 0) {
    return (
      <EmptyState
        icon="✅"
        title="暂无错误"
        description="选定时间范围内没有捕获到错误，系统运行正常"
      />
    );
  }

  /* 数据表格 */
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>错误消息</th>
            <th>文件</th>
            <th style={{ textAlign: 'right' }}>次数</th>
            <th style={{ textAlign: 'right' }}>影响用户</th>
            <th style={{ textAlign: 'right' }}>最近发生</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((error) => (
            <tr
              key={error.fingerprint}
              className="clickable"
              onClick={() => handleRowClick(error.fingerprint)}
            >
              {/*
                错误消息列
                使用 truncate 类名截断过长的文本
                最大宽度 400px，超出部分显示省略号
              */}
              <td>
                <span
                  className="truncate"
                  style={{ maxWidth: '400px', display: 'inline-block' }}
                  title={error.message}
                >
                  {error.message}
                </span>
              </td>

              {/* 文件名列：使用等宽字体，次要文字色 */}
              <td className="font-mono text-muted" style={{ fontSize: '12px' }}>
                {error.filename || '-'}
              </td>

              {/*
                发生次数列
                使用红色强调高频错误（> 100 次）
              */}
              <td style={{ textAlign: 'right' }}>
                <span className={error.count > 100 ? 'text-error' : ''}>
                  {error.count.toLocaleString()}
                </span>
              </td>

              {/* 影响用户数列 */}
              <td style={{ textAlign: 'right' }}>
                {error.affectedUsers.toLocaleString()}
              </td>

              {/* 最近发生时间列：显示相对时间 */}
              <td style={{ textAlign: 'right' }} className="text-muted">
                {formatRelativeTime(error.lastSeen)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

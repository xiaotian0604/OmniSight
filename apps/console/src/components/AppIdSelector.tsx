/**
 * @file AppId 选择器组件
 * @description 用于选择当前查看的项目（appId）
 *
 * 功能：
 * 1. 从 Gateway 获取所有有数据的 appId 列表
 * 2. 显示每个 appId 的错误数量和总事件数量
 * 3. 支持切换当前选中的 appId
 * 4. 自动将选中的 appId 持久化到 localStorage
 *
 * 使用方式：
 *   <AppIdSelector />
 *
 * 交互行为：
 * - 点击选择器展开下拉菜单
 * - 选择不同的 appId 后自动切换
 * - 切换后所有数据查询会自动更新（通过 Zustand store 联动）
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGlobalStore } from '@/store/global.store';
import { getApps } from '@/api/apps';
import type { AppInfo } from '@/api/apps';

/**
 * AppId 选择器组件
 *
 * 渲染逻辑：
 * 1. 组件挂载时从 Gateway 获取 appId 列表
 * 2. 显示当前选中的 appId
 * 3. 点击展开下拉菜单，显示所有可用的 appId
 * 4. 每个 appId 显示错误数量和总事件数量
 * 5. 选择后更新 Zustand store 和 localStorage
 */
export function AppIdSelector() {
  /** 下拉菜单展开状态 */
  const [isOpen, setIsOpen] = useState(false);

  /** 从 Zustand store 获取当前 appId 和设置方法 */
  const { appId, setAppId } = useGlobalStore();

  /**
   * 通过 React Query 获取 appId 列表
   *
   * 这里统一走 api 层做数据正规化，避免 SQL 聚合结果里的字符串数字
   * 在不同组件中被重复解析。
   */
  const {
    data: apps = [],
    isLoading: loading,
    isError,
    error,
    refetch,
  } = useQuery<AppInfo[]>({
    queryKey: ['apps-list'],
    queryFn: getApps,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (apps.length === 0) {
      return;
    }

    /**
     * 如果当前没有选中的 appId，或者选中的 appId 已不在列表中，
     * 自动选择第一个可用项目。
     */
    const currentAppId = localStorage.getItem('omnisight-app-id');
    const appIdExists = apps.some((app) => app.appId === currentAppId);

    if (!currentAppId || !appIdExists) {
      setAppId(apps[0].appId);
    }
  }, [apps, setAppId]);

  /**
   * 选择 appId
   * @param selectedAppId - 选中的 appId
   */
  function handleSelectApp(selectedAppId: string) {
    setAppId(selectedAppId);
    setIsOpen(false);
  }

  /**
   * 格式化数字显示
   * @param count - 数量
   * @returns 格式化后的字符串
   */
  function formatCount(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  }

  /**
   * 格式化时间显示
   * @param timestamp - 时间戳字符串
   * @returns 格式化后的相对时间
   */
  function formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN');
  }

  /**
   * 加载中状态
   */
  if (loading) {
    return (
      <div className="app-id-selector loading">
        <span className="loading-text">加载中...</span>
      </div>
    );
  }

  /**
   * 错误状态
   */
  if (isError) {
    return (
      <div className="app-id-selector error">
        <span className="error-text">⚠️ {error instanceof Error ? error.message : '未知错误'}</span>
        <button onClick={() => refetch()} className="retry-button">
          重试
        </button>
      </div>
    );
  }

  /**
   * 无数据状态
   */
  if (apps.length === 0) {
    return (
      <div className="app-id-selector empty">
        <span className="empty-text">暂无项目数据</span>
      </div>
    );
  }

  /**
   * 正常渲染
   */
  return (
    <div className="app-id-selector">
      {/* 选择器按钮 */}
      <button
        className="selector-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="current-app-id">{appId}</span>
        <span className="arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="dropdown-menu" role="listbox">
          {apps.map((app) => (
            <button
              key={app.appId}
              className={`dropdown-item ${app.appId === appId ? 'selected' : ''}`}
              onClick={() => handleSelectApp(app.appId)}
              role="option"
              aria-selected={app.appId === appId}
            >
              <div className="app-info">
                <span className="app-id">{app.appId}</span>
                <span className="app-stats">
                  <span
                    className="error-count"
                    title="错误真实发生次数，已包含同错防抖窗口内聚合的 occurrences"
                  >
                    🐛 {formatCount(app.errorCount)}
                  </span>
                  <span
                    className="total-count"
                    title="总事件数；其中错误事件按真实 occurrences 计权"
                  >
                    📊 {formatCount(app.totalCount)}
                  </span>
                </span>
              </div>
              <span className="last-seen">{formatTime(app.lastSeen)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

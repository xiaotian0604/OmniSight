/**
 * @file 应用主布局与路由配置
 * @description OmniSight 控制台的顶层布局组件
 *
 * 布局结构：
 * ┌──────────────────────────────────────────────┐
 * │  侧栏导航（Sidebar）  │    顶部 Header       │
 * │                       │  ┌─────────────────┐ │
 * │  · 概览               │  │ TimeRangePicker │ │
 * │  · 错误管理           │  └─────────────────┘ │
 * │  · 行为回放           │  ┌─────────────────┐ │
 * │  · 性能分析           │  │                 │ │
 * │  · 设置               │  │   页面内容区     │ │
 * │                       │  │   (Routes)      │ │
 * │                       │  │                 │ │
 * │                       │  └─────────────────┘ │
 * └──────────────────────────────────────────────┘
 *
 * 路由配置：
 * - /              → 概览仪表盘（默认首页）
 * - /errors        → 错误聚合列表
 * - /errors/:fingerprint → 错误详情页
 * - /replay        → 录像列表
 * - /replay/player/:sessionId → 录像回放页
 * - /performance   → 性能分析
 * - /settings      → 设置（含子路由）
 *
 * 交互行为：
 * - 侧栏导航项高亮当前路由
 * - 顶部 Header 显示项目名称和全局时间范围选择器
 * - 时间范围变更会影响所有数据查询（通过 Zustand 全局 store 联动）
 */
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { TimeRangePicker } from '@/components/TimeRangePicker';

/**
 * 路由懒加载配置
 *
 * 使用 React.lazy 实现代码分割（Code Splitting），
 * 每个页面模块只在用户首次访问时才加载对应的 JS 文件。
 * 好处：
 * 1. 减小首屏 bundle 体积，加快初始加载速度
 * 2. 按需加载，节省用户带宽
 * 3. Vite 构建时会自动将每个 lazy 模块拆分为独立 chunk
 */
const OverviewPage = lazy(() => import('@/pages/overview'));
const ErrorsPage = lazy(() => import('@/pages/errors'));
const ErrorDetailPage = lazy(() => import('@/pages/errors/detail'));
const ReplayPage = lazy(() => import('@/pages/replay'));
const ReplayPlayerPage = lazy(() => import('@/pages/replay/player'));
const PerformancePage = lazy(() => import('@/pages/performance'));
const SettingsPage = lazy(() => import('@/pages/settings'));

/**
 * 侧栏导航项配置
 * 每个导航项包含：
 * - path: 路由路径，用于 NavLink 的 to 属性
 * - label: 显示文本
 * - icon: 导航图标（使用 Unicode Emoji 简化实现，生产环境建议替换为 SVG 图标）
 */
const NAV_ITEMS = [
  { path: '/', label: '概览', icon: '📊' },
  { path: '/errors', label: '错误管理', icon: '🐛' },
  { path: '/replay', label: '行为回放', icon: '🎬' },
  { path: '/performance', label: '性能分析', icon: '⚡' },
  { path: '/settings', label: '设置', icon: '⚙️' },
] as const;

/**
 * 页面加载中的占位组件
 * 当懒加载的页面模块尚未下载完成时显示
 * 使用 CSS 动画实现简单的加载指示器
 */
function PageLoading() {
  return (
    <div className="page-loading">
      <div className="page-loading-spinner" />
      <p>加载中...</p>
    </div>
  );
}

/**
 * App 主组件
 *
 * 渲染逻辑：
 * 1. 最外层 .app-layout 使用 CSS Grid 实现侧栏 + 主内容区的两栏布局
 * 2. 侧栏（.sidebar）固定在左侧，包含 Logo 和导航菜单
 * 3. 主内容区（.main-content）包含顶部 Header 和路由页面
 * 4. NavLink 组件会自动为当前路由对应的导航项添加 .active 类名
 * 5. Suspense 包裹懒加载路由，在模块加载期间显示 PageLoading
 */
export default function App() {
  return (
    <div className="app-layout">
      {/* ==================== 侧栏导航 ==================== */}
      <aside className="sidebar">
        {/* Logo 区域：点击回到首页 */}
        <div className="sidebar-logo">
          <NavLink to="/" className="logo-link">
            <span className="logo-icon">👁️</span>
            <span className="logo-text">OmniSight</span>
          </NavLink>
        </div>

        {/* 导航菜单列表 */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              /**
               * NavLink 的 className 回调函数
               * isActive: 当前路由是否匹配该导航项
               * 匹配时添加 'active' 类名，用于高亮样式
               */
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
              /**
               * end 属性：精确匹配
               * 对于根路径 '/'，如果不加 end，访问 /errors 时 '/' 也会被标记为 active
               * 加上 end 后只有精确匹配 '/' 时才高亮
               */
              end={item.path === '/'}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* 侧栏底部：版本信息 */}
        <div className="sidebar-footer">
          <span className="version-text">v0.0.1</span>
        </div>
      </aside>

      {/* ==================== 主内容区 ==================== */}
      <main className="main-content">
        {/* 顶部 Header：项目名称 + 全局时间范围选择器 */}
        <header className="top-header">
          <h1 className="header-title">OmniSight 控制台</h1>
          {/*
            TimeRangePicker: 全局时间范围选择器
            选择的时间范围会写入 Zustand 全局 store，
            所有使用 useMetrics 等 hook 的组件会自动响应时间范围变更并重新请求数据
          */}
          <TimeRangePicker />
        </header>

        {/* 页面内容区：根据路由渲染对应页面组件 */}
        <div className="page-content">
          <Suspense fallback={<PageLoading />}>
            <Routes>
              {/* 概览仪表盘 — 默认首页，展示错误率趋势、Vitals 评分、Top 错误 */}
              <Route path="/" element={<OverviewPage />} />

              {/* 错误管理 — 错误聚合列表，按指纹分组显示频次和影响用户数 */}
              <Route path="/errors" element={<ErrorsPage />} />

              {/*
                错误详情 — 使用 :fingerprint 动态路由参数
                展示堆栈信息、用户操作面包屑、关联录像链接
              */}
              <Route path="/errors/:fingerprint" element={<ErrorDetailPage />} />

              {/* 行为回放 — 录像列表，显示 session_id、创建时间、关联错误数 */}
              <Route path="/replay" element={<ReplayPage />} />

              {/*
                录像播放 — 使用 :sessionId 动态路由参数
                rrweb-player 回放 + 右侧事件时间轴
              */}
              <Route path="/replay/player/:sessionId" element={<ReplayPlayerPage />} />

              {/* 性能分析 — Vitals 趋势图 + 接口耗时分布 + 资源加载分析 */}
              <Route path="/performance" element={<PerformancePage />} />

              {/* 设置 — 包含 SDK 接入指引和 SourceMap 管理子路由 */}
              <Route path="/settings/*" element={<SettingsPage />} />

              {/* 未匹配路由 — 重定向到首页 */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
}

/**
 * @file 设置页面路由
 * @description 设置模块的路由容器，包含 SDK 接入指引和 SourceMap 管理两个子页面
 *
 * 路由结构：
 * /settings              → 默认重定向到 /settings/sdk-setup
 * /settings/sdk-setup    → SDK 接入指引页面
 * /settings/sourcemap    → SourceMap 上传记录页面
 *
 * 页面布局：
 * ┌─────────────────────────────────────────────────┐
 * │  页面标题：设置                                   │
 * │  ┌──────────────┐  ┌──────────────┐             │
 * │  │ SDK 接入指引  │  │ SourceMap    │  ← Tab 导航 │
 * │  └──────────────┘  └──────────────┘             │
 * ├─────────────────────────────────────────────────┤
 * │                                                 │
 * │  子页面内容区（Routes 渲染）                      │
 * │                                                 │
 * └─────────────────────────────────────────────────┘
 *
 * 使用 Tab 式导航而非侧栏子菜单，因为设置页面的子项较少（2 个），
 * Tab 导航更简洁直观
 */
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';

/**
 * 懒加载设置子页面
 * 设置页面访问频率较低，懒加载可以减小首屏 bundle 体积
 */
const SdkSetupPage = lazy(() => import('./sdk-setup'));
const SourcemapPage = lazy(() => import('./sourcemap'));

/**
 * 设置页面 Tab 导航配置
 *
 * @property path - 子路由路径（相对于 /settings）
 * @property label - Tab 显示文本
 */
const SETTING_TABS = [
  { path: 'sdk-setup', label: 'SDK 接入指引' },
  { path: 'sourcemap', label: 'SourceMap 管理' },
] as const;

/**
 * 设置页面路由容器组件
 *
 * 渲染逻辑：
 * 1. 页面标题
 * 2. Tab 导航栏（使用 NavLink 实现路由联动的 Tab 切换）
 * 3. 子路由内容区（Suspense + Routes）
 *
 * Tab 导航使用 NavLink 而非普通按钮：
 * - NavLink 自动与路由状态同步
 * - 支持浏览器前进/后退按钮
 * - 可以直接通过 URL 访问特定 Tab
 */
export default function SettingsPage() {
  return (
    <div>
      {/* 页面标题 */}
      <div className="page-header">
        <div className="page-header-info">
          <h2>设置</h2>
          <p>SDK 接入配置和 SourceMap 管理</p>
        </div>
      </div>

      {/* Tab 导航栏 */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border-default)',
          paddingBottom: '0',
        }}
      >
        {SETTING_TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            /**
             * Tab 样式：
             * - 默认：灰色文字，无底边框
             * - 选中（active）：蓝色文字 + 蓝色底边框
             */
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            style={({ isActive }) => ({
              borderBottom: isActive ? '2px solid #58a6ff' : '2px solid transparent',
              borderRadius: 0,
              paddingBottom: '12px',
            })}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* 子路由内容区 */}
      <Suspense
        fallback={
          <div className="text-muted" style={{ padding: '40px', textAlign: 'center' }}>
            加载中...
          </div>
        }
      >
        <Routes>
          {/* SDK 接入指引 */}
          <Route path="sdk-setup" element={<SdkSetupPage />} />

          {/* SourceMap 管理 */}
          <Route path="sourcemap" element={<SourcemapPage />} />

          {/* 默认重定向到 SDK 接入指引 */}
          <Route path="*" element={<Navigate to="sdk-setup" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

/**
 * @file 应用入口文件
 * @description OmniSight 控制台的 React 应用启动入口
 *
 * 职责：
 * 1. 使用 React 18 的 createRoot API 挂载应用（并发模式）
 * 2. 配置 @tanstack/react-query 的 QueryClient，提供全局数据请求缓存
 * 3. 配置 BrowserRouter 提供客户端路由能力
 * 4. 包裹 ErrorBoundary 捕获渲染时的未处理异常，防止白屏
 * 5. 导入全局样式
 *
 * 组件嵌套层级（由外到内）：
 *   StrictMode → QueryClientProvider → BrowserRouter → ErrorBoundary → App
 *
 * 为什么用 StrictMode？
 *   开发模式下会对组件进行双重渲染，帮助发现副作用问题，
 *   生产构建时会自动移除，不影响性能。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from '@/App';
import '@/styles.css';

/**
 * React Query 客户端实例
 *
 * 全局配置说明：
 * - staleTime: 30秒 — 数据在 30 秒内被视为"新鲜"，不会触发后台重新请求
 *   （监控数据更新频率适中，30 秒是合理的平衡点）
 * - retry: 2 — 请求失败后最多重试 2 次（共 3 次尝试）
 *   （避免网络抖动导致的误报，但不过度重试浪费资源）
 * - refetchOnWindowFocus: false — 切换浏览器标签页时不自动重新请求
 *   （监控面板通常长时间开着，频繁重请求会给后端带来不必要的压力）
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * 获取 DOM 挂载节点
 * 对应 index.html 中的 <div id="root"></div>
 * 使用非空断言（!）因为我们确信 index.html 中存在该节点
 */
const rootElement = document.getElementById('root')!;

/**
 * 使用 React 18 的 createRoot API 创建根节点并渲染应用
 *
 * createRoot 是 React 18 引入的新 API，替代了旧的 ReactDOM.render()
 * 它启用了并发特性（Concurrent Features），包括：
 * - 自动批处理（Automatic Batching）
 * - Transitions（过渡更新）
 * - Suspense 改进
 */
createRoot(rootElement).render(
  <StrictMode>
    {/* QueryClientProvider: 为所有子组件提供 React Query 的缓存和请求能力 */}
    <QueryClientProvider client={queryClient}>
      {/* BrowserRouter: 使用 HTML5 History API 实现客户端路由 */}
      <BrowserRouter>
        {/* ErrorBoundary: 捕获子组件树中的 JS 错误，显示友好的降级 UI */}
        <ErrorBoundary>
          {/* App: 应用主体，包含路由配置、侧栏导航和页面内容 */}
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

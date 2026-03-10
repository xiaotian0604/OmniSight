/**
 * @file Vite 构建配置
 * @description OmniSight 控制台的 Vite 开发服务器和构建配置
 *
 * 主要功能：
 * 1. React 插件 — 支持 JSX 快速刷新（Fast Refresh），开发时修改组件即时生效
 * 2. 路径别名 — 将 @ 映射到 src 目录，简化深层嵌套的 import 路径
 * 3. 开发代理 — 将 /v1 和 /health 请求代理到本地 Gateway 服务（localhost:3000），
 *    避免开发环境跨域问题，同时模拟生产环境的反向代理行为
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  /**
   * Vite 插件列表
   * @vitejs/plugin-react 提供：
   * - JSX 转换（使用 esbuild，速度极快）
   * - React Fast Refresh（开发时组件热更新，保留状态）
   */
  plugins: [react()],

  resolve: {
    alias: {
      /**
       * 路径别名配置
       * 将 '@' 映射到项目 src 目录，使用方式：
       *   import { useMetrics } from '@/hooks/useMetrics'
       *   import ErrorBoundary from '@/components/ErrorBoundary'
       * 对应的 TypeScript 路径映射在 tsconfig.json 的 paths 中配置
       */
      '@': resolve(__dirname, 'src'),
    },
  },

  server: {
    /**
     * 开发服务器端口
     * 控制台默认运行在 5173 端口（Vite 默认值）
     */
    port: 5173,

    /**
     * API 代理配置
     * 开发环境下，前端请求 /v1/* 和 /health 会被代理到 Gateway 服务
     * 这样前端代码中可以直接使用相对路径（如 axios.get('/v1/errors')），
     * 无需关心后端服务的实际地址，生产环境通过 Nginx 反向代理实现相同效果
     */
    proxy: {
      /**
       * /v1 — 所有业务 API 接口代理
       * 包括：/v1/errors, /v1/metrics, /v1/replay, /v1/ingest 等
       * changeOrigin: true 修改请求头中的 Host 为目标地址，避免后端校验失败
       */
      '/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      /**
       * /health — 健康检查接口代理
       * 用于控制台展示 Gateway 服务状态
       */
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      /**
       * /ws — WebSocket 连接代理
       * 用于实时告警推送，ws: true 启用 WebSocket 协议代理
       */
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
});

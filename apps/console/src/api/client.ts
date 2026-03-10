/**
 * @file Axios HTTP 客户端实例
 * @description 创建统一配置的 axios 实例，所有 API 请求都通过此实例发出
 *
 * 核心功能：
 * 1. 统一基础路径 — 所有请求自动加上 /v1 前缀
 * 2. 统一超时配置 — 15 秒超时，避免请求长时间挂起
 * 3. 请求拦截器 — 自动注入 appId 到请求头（用于后端鉴权和数据隔离）
 * 4. 响应拦截器 — 统一错误处理，将后端错误转换为友好的错误信息
 *
 * 使用方式：
 *   import { apiClient } from '@/api/client';
 *   const { data } = await apiClient.get('/errors', { params: { limit: 50 } });
 *
 * 为什么不直接用 axios？
 *   直接使用 axios 会导致每个请求都需要手动配置 baseURL、headers、错误处理，
 *   封装后只需关注业务逻辑，减少重复代码，统一错误处理逻辑。
 */
import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

/**
 * 后端 API 标准错误响应格式
 * Gateway 返回的错误都遵循此结构
 */
interface ApiErrorResponse {
  /** HTTP 状态码 */
  statusCode: number;
  /** 错误描述信息 */
  message: string;
  /** 错误类型标识（如 'VALIDATION_ERROR', 'NOT_FOUND'） */
  error?: string;
}

/**
 * 创建 axios 实例
 *
 * baseURL: '/v1' — 所有请求路径会自动拼接此前缀
 *   例如：apiClient.get('/errors') 实际请求 /v1/errors
 *   开发环境下 Vite proxy 会将 /v1 代理到 localhost:3000
 *   生产环境下通过 Nginx 反向代理到 Gateway 服务
 *
 * timeout: 15000 — 15 秒超时
 *   监控数据查询可能涉及大量时序数据聚合，给予充足的超时时间
 *   但不能太长，避免用户长时间等待无响应
 *
 * Content-Type: 'application/json' — 所有请求默认使用 JSON 格式
 */
export const apiClient = axios.create({
  baseURL: '/v1',
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * 请求拦截器
 *
 * 在每个请求发出前自动执行，用于：
 * 1. 注入 x-app-id 请求头 — 后端通过此头部识别当前操作的项目
 *    appId 从 Zustand 全局 store 获取（通过 localStorage 持久化）
 * 2. 未来可扩展：注入 JWT Token、添加请求签名等
 *
 * 为什么用 localStorage 而不是直接 import store？
 *   避免循环依赖：api/client.ts → store → api/xxx.ts → api/client.ts
 *   localStorage 是最简单的解耦方式
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const appId = localStorage.getItem('omnisight-app-id');
    if (appId) {
      config.headers.set('x-app-id', appId);
      /**
       * 同时将 appId 注入到 query params 中
       * Gateway 的 query controller 从 @Query('appId') 读取此参数，
       * 而 ApiKeyGuard 从 header 的 x-api-key 读取鉴权信息。
       * 两者职责不同：appId 用于数据过滤，api-key 用于身份验证。
       */
      config.params = config.params || {};
      if (!config.params.appId) {
        config.params.appId = appId;
      }
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  },
);

/**
 * 响应拦截器
 *
 * 统一处理所有 API 响应：
 * - 成功响应（2xx）：直接返回，由调用方处理
 * - 失败响应（4xx/5xx）：提取后端返回的错误信息，构造友好的错误对象
 *
 * 错误处理策略：
 * - 401 未授权：可能是 API Key 过期或无效，提示用户检查配置
 * - 403 禁止访问：权限不足
 * - 404 未找到：请求的资源不存在
 * - 429 请求过多：触发限流，提示稍后重试
 * - 500+ 服务器错误：后端异常，提示用户稍后重试
 * - 网络错误（无 response）：网络不可达或 Gateway 服务未启动
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response) {
      const { status, data } = error.response;
      const message = data?.message || '请求失败';

      switch (status) {
        case 401:
          console.error('[OmniSight API] 认证失败，请检查 API Key 配置', message);
          break;
        case 403:
          console.error('[OmniSight API] 权限不足', message);
          break;
        case 404:
          console.error('[OmniSight API] 资源不存在', message);
          break;
        case 429:
          console.error('[OmniSight API] 请求频率过高，请稍后重试', message);
          break;
        default:
          if (status >= 500) {
            console.error('[OmniSight API] 服务器错误，请稍后重试', message);
          } else {
            console.error(`[OmniSight API] 请求错误 (${status})`, message);
          }
      }
    } else if (error.request) {
      console.error(
        '[OmniSight API] 网络错误：无法连接到 Gateway 服务。',
        '请确认 Gateway 是否已启动（pnpm --filter @omnisight/gateway dev）',
      );
    }

    return Promise.reject(error);
  },
);

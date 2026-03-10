/**
 * @file 错误相关 API 接口
 * @description 封装与错误数据相关的所有 HTTP 请求
 *
 * 对应 Gateway 接口：
 * - GET /v1/errors       → 错误聚合列表（按指纹分组，显示频次/影响用户数）
 * - GET /v1/errors/:fingerprint → 错误详情（含还原后的堆栈、面包屑、关联录像）
 *
 * 数据流向：
 *   组件 → useQuery hook → 本文件的 API 函数 → apiClient → Vite proxy → Gateway → PostgreSQL
 */
import { apiClient } from './client';

/* ================================================================
   类型定义
   ================================================================ */

/**
 * 错误聚合列表项
 * 对应 SQL 查询：按 fingerprint 分组，统计频次和影响用户数
 *
 * @property fingerprint - 错误指纹（hash(message + stack[0])），用于聚合去重
 * @property message - 错误消息文本（如 "Cannot read property 'x' of undefined"）
 * @property filename - 发生错误的文件名（如 "app.js"）
 * @property count - 该错误在时间范围内的发生次数
 * @property affectedUsers - 受影响的独立用户数（按 session_id 去重）
 * @property lastSeen - 最后一次发生时间（ISO 8601 格式）
 * @property firstSeen - 首次发生时间（ISO 8601 格式）
 */
export interface ErrorGroup {
  fingerprint: string;
  message: string;
  filename?: string;
  count: number;
  affectedUsers: number;
  lastSeen: string;
  firstSeen: string;
}

/**
 * 错误详情数据
 * 包含完整的错误上下文信息，用于错误详情页展示
 *
 * @property fingerprint - 错误指纹
 * @property message - 错误消息
 * @property stack - 还原后的堆栈信息（如果上传了 SourceMap，则为源码级堆栈）
 * @property filename - 源文件名
 * @property lineno - 源码行号
 * @property colno - 源码列号
 * @property count - 总发生次数
 * @property affectedUsers - 受影响用户数
 * @property lastSeen - 最后发生时间
 * @property firstSeen - 首次发生时间
 * @property breadcrumbs - 错误发生前的用户操作面包屑（时间倒序）
 * @property replaySessionId - 关联的录像 session_id（如果有的话）
 * @property tags - 错误标签（浏览器、操作系统等环境信息）
 */
export interface ErrorDetail {
  fingerprint: string;
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  count: number;
  affectedUsers: number;
  lastSeen: string;
  firstSeen: string;
  breadcrumbs: Breadcrumb[];
  replaySessionId?: string;
  tags: Record<string, string>;
}

/**
 * 用户操作面包屑
 * 记录错误发生前用户的操作轨迹，帮助复现问题
 *
 * @property type - 操作类型：click（点击）、navigation（路由跳转）、
 *                  xhr（接口请求）、console（控制台输出）、error（错误）
 * @property message - 操作描述（如 "点击了提交按钮"、"导航到 /dashboard"）
 * @property timestamp - 操作发生时间（ISO 8601 格式）
 * @property data - 附加数据（如接口请求的 URL、状态码等）
 */
export interface Breadcrumb {
  type: 'click' | 'navigation' | 'xhr' | 'console' | 'error';
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

/**
 * 错误列表查询参数
 *
 * @property start - 时间范围起始（ISO 8601 格式）
 * @property end - 时间范围结束（ISO 8601 格式）
 * @property limit - 返回条数上限（默认 50）
 * @property offset - 分页偏移量（默认 0）
 * @property sort - 排序字段（count: 按频次，lastSeen: 按最近发生时间）
 */
export interface GetErrorsParams {
  start: string;
  end: string;
  limit?: number;
  offset?: number;
  sort?: 'count' | 'lastSeen';
}

/* ================================================================
   API 函数
   ================================================================ */

/**
 * 获取错误聚合列表
 *
 * 调用 Gateway 的 GET /v1/errors 接口
 * 返回按指纹分组的错误列表，每组显示频次、影响用户数、首次/最后发生时间
 *
 * 后端 SQL 逻辑：
 *   SELECT fingerprint, payload->>'message', COUNT(*), COUNT(DISTINCT session_id), ...
 *   FROM events WHERE type = 'error' AND ts BETWEEN $start AND $end
 *   GROUP BY fingerprint ORDER BY count DESC
 *
 * @param params - 查询参数（时间范围、分页、排序）
 * @returns 错误聚合列表
 */
export async function getErrors(params: GetErrorsParams): Promise<ErrorGroup[]> {
  const { data } = await apiClient.get<ErrorGroup[]>('/errors', {
    params: {
      from: params.start,
      to: params.end,
      limit: params.limit,
      offset: params.offset,
      sort: params.sort,
    },
  });
  return data;
}

/**
 * 获取错误详情
 *
 * 调用 Gateway 的 GET /v1/errors/:fingerprint 接口
 * 返回指定错误指纹的完整详情，包括：
 * - 还原后的堆栈信息（如果上传了 SourceMap）
 * - 错误发生前的用户操作面包屑
 * - 关联的录像 session_id
 * - 环境标签（浏览器、OS 等）
 *
 * 后端处理流程：
 * 1. 根据 fingerprint 查询 events 表获取最新一条错误事件
 * 2. 如果有 SourceMap，使用 source-map 库还原压缩后的堆栈
 * 3. 查询同一 session 中错误发生前的行为事件作为面包屑
 * 4. 查询 replay_sessions 表检查是否有关联录像
 *
 * @param fingerprint - 错误指纹（hash 值）
 * @returns 错误详情数据
 */
export async function getErrorDetail(fingerprint: string): Promise<ErrorDetail> {
  const { data } = await apiClient.get<ErrorDetail>(`/errors/${fingerprint}`);
  return data;
}

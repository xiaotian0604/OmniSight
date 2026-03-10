/**
 * @file 录像回放 API 接口
 * @description 封装与 rrweb 录像数据相关的所有 HTTP 请求
 *
 * 对应 Gateway 接口：
 * - GET /v1/replay           → 录像列表（分页，含关联错误数）
 * - GET /v1/replay/:sessionId → 获取指定 session 的完整录像数据
 *
 * 录像数据流向：
 *   SDK (rrweb.record) → POST /v1/replay → replay_sessions 表
 *   控制台 → GET /v1/replay/:sessionId → rrweb-player 渲染回放
 *
 * 录像存储策略：
 *   SDK 采用"错误窗口"策略，仅在 JS 错误发生时上传录像：
 *   - 错误前 30 秒的 Ring Buffer 数据
 *   - 错误后 10 秒的继续录制数据
 *   这样既能复现错误场景，又大幅降低存储成本（降低约 80%）
 */
import { apiClient } from './client';

/* ================================================================
   类型定义
   ================================================================ */

/**
 * 录像列表项
 * 用于录像列表页展示每条录像的摘要信息
 *
 * @property sessionId - 用户会话 ID（UUID 格式），也是录像的唯一标识
 * @property appId - 所属项目 ID
 * @property errorCount - 该录像中关联的错误数量（录像是因为错误触发的，可能有多个错误）
 * @property duration - 录像时长，单位毫秒（通常为 30s~40s，即错误窗口大小）
 * @property createdAt - 录像创建时间（ISO 8601 格式）
 */
export interface ReplaySession {
  sessionId: string;
  appId: string;
  errorCount: number;
  duration: number;
  createdAt: string;
}

/**
 * 录像详情数据
 * 包含完整的 rrweb 事件数组，用于 rrweb-player 回放
 *
 * @property sessionId - 会话 ID
 * @property events - rrweb 录制的事件数组（DOM 快照、增量变更、鼠标移动等）
 *                    直接传给 rrweb-player 的 props.events 即可回放
 * @property errorCount - 关联错误数
 * @property duration - 录像时长（ms）
 * @property createdAt - 创建时间
 */
export interface ReplayDetail {
  sessionId: string;
  events: unknown[];
  errorCount: number;
  duration: number;
  createdAt: string;
}

/**
 * 录像列表查询参数
 *
 * @property start - 时间范围起始
 * @property end - 时间范围结束
 * @property limit - 返回条数上限（默认 20）
 * @property offset - 分页偏移量
 */
export interface GetReplayListParams {
  start?: string;
  end?: string;
  limit?: number;
  offset?: number;
}

/* ================================================================
   API 函数
   ================================================================ */

/**
 * 获取录像列表
 *
 * 调用 Gateway 的 GET /v1/replay 接口
 * 返回录像摘要列表，按创建时间倒序排列
 *
 * 后端 SQL 逻辑：
 *   SELECT session_id, app_id, error_count, duration, created_at
 *   FROM replay_sessions
 *   WHERE app_id = $appId AND created_at BETWEEN $start AND $end
 *   ORDER BY created_at DESC
 *   LIMIT $limit OFFSET $offset
 *
 * @param params - 查询参数（时间范围、分页）
 * @returns 录像摘要列表
 */
export async function getReplayList(params?: GetReplayListParams): Promise<ReplaySession[]> {
  const { data } = await apiClient.get<ReplaySession[]>('/replay', { params });
  return data;
}

/**
 * 获取指定 session 的完整录像数据
 *
 * 调用 Gateway 的 GET /v1/replay/:sessionId 接口
 * 返回完整的 rrweb 事件数组，可直接用于 rrweb-player 回放
 *
 * 后端 SQL 逻辑：
 *   SELECT * FROM replay_sessions WHERE session_id = $sessionId
 *
 * 注意事项：
 * - 录像数据可能较大（几百 KB 到几 MB），需要考虑加载状态展示
 * - events 数组中的事件类型包括：FullSnapshot（完整 DOM 快照）、
 *   IncrementalSnapshot（增量变更）、Meta（元数据）等
 * - rrweb-player 会自动解析这些事件并渲染回放画面
 *
 * @param sessionId - 用户会话 ID
 * @returns 包含完整 rrweb 事件数组的录像详情
 */
export async function getReplayBySessionId(sessionId: string): Promise<ReplayDetail> {
  const { data } = await apiClient.get<ReplayDetail>(`/replay/${sessionId}`);
  return data;
}

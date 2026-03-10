/**
 * ===============================================================
 * OmniSight Gateway — 录像管理 Service
 * ===============================================================
 *
 * 职责：
 * 管理 rrweb 用户操作录像的存储和查询。
 *
 * 录像数据来源：
 * SDK 的 replay.ts 模块使用 rrweb 录制用户操作，采用"错误窗口策略"：
 * - 平时静默录制，Ring Buffer 保留最近 30 秒
 * - JS 错误发生时，再录 10 秒后上传（前 30s + 后 10s = 40s 录像）
 * - 这样既能复现错误场景，又大幅减少存储成本（仅上传有错误的片段）
 *
 * 数据存储：
 * 录像数据存储在 PostgreSQL 的 replay_sessions 表中
 * events 字段是 JSONB 类型，存储 rrweb 事件数组
 *
 * 提供的方法：
 * - save() — 保存录像（SDK 上传时调用）
 * - getBySessionId() — 按会话 ID 查询单个录像（回放页面使用）
 * - list() — 查询录像列表（录像列表页使用）
 * ===============================================================
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database.module';

@Injectable()
export class ReplayService {
  constructor(
    /**
     * 注入 PostgreSQL 连接池
     * 所有数据库操作通过连接池执行，自动管理连接的获取和释放
     */
    @Inject(PG_POOL) private readonly pg: Pool,
  ) {}

  /**
   * 保存 rrweb 录像数据
   *
   * 业务逻辑：
   * 1. 使用 INSERT ... ON CONFLICT 实现 upsert（插入或更新）
   *    - 如果 session_id 已存在（同一会话多次触发错误），更新录像数据
   *    - 合并新的事件到已有事件数组中，并累加错误计数
   * 2. 计算录像时长：最后一个事件的时间戳 - 第一个事件的时间戳
   *
   * @param sessionId - 用户会话 ID（SDK 生成的 UUID）
   * @param appId - 项目标识
   * @param events - rrweb 事件数组（包含 DOM 快照、鼠标移动、点击等）
   * @param errorCount - 本次录像关联的错误数量
   *
   * @returns 插入/更新后的录像记录
   */
  async save(
    sessionId: string,
    appId: string,
    events: any[],
    errorCount: number = 1,
  ) {
    /**
     * 计算录像时长（毫秒）
     * rrweb 事件的 timestamp 字段是毫秒级时间戳
     * 用最后一个事件的时间减去第一个事件的时间得到总时长
     */
    const duration =
      events.length > 1
        ? events[events.length - 1].timestamp - events[0].timestamp
        : 0;

    const result = await this.pg.query(
      `INSERT INTO replay_sessions (session_id, app_id, events, error_count, duration)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (session_id) DO UPDATE SET
         events = replay_sessions.events || $3::jsonb,
         error_count = replay_sessions.error_count + $4,
         duration = GREATEST(replay_sessions.duration, $5)
       RETURNING *`,
      [sessionId, appId, JSON.stringify(events), errorCount, duration],
    );

    return result.rows[0];
  }

  /**
   * 根据会话 ID 查询单个录像
   *
   * 业务场景：
   * 用户在 console 的回放页面点击某个录像，前端调用此接口获取完整的 rrweb 事件数据，
   * 然后传给 rrweb-player 进行回放渲染。
   *
   * @param sessionId - 用户会话 ID
   *
   * @returns 录像记录（包含 session_id, app_id, events, error_count, duration, created_at）
   * @throws {NotFoundException} 当指定的 session_id 不存在时抛出 404 错误
   */
  async getBySessionId(sessionId: string) {
    const result = await this.pg.query(
      'SELECT * FROM replay_sessions WHERE session_id = $1',
      [sessionId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(
        `未找到会话 ID 为 ${sessionId} 的录像记录`,
      );
    }

    return result.rows[0];
  }

  /**
   * 查询录像列表
   *
   * 业务场景：
   * console 的录像列表页展示所有录像，支持分页。
   * 列表页显示：会话 ID、关联错误数、录像时长、创建时间。
   * 用户可以点击某条记录进入回放页面。
   *
   * @param appId - 项目标识，筛选当前项目的录像
   * @param limit - 每页数量，默认 20
   * @param offset - 偏移量，用于分页（第 N 页 = offset: (N-1) * limit）
   *
   * @returns 录像记录数组（按创建时间倒序，最新的在前面）
   *   注意：列表接口不返回 events 字段（JSONB 数据量大），
   *   只有进入回放页面时才通过 getBySessionId 获取完整事件数据
   */
  async list(appId: string, limit: number = 20, offset: number = 0) {
    const result = await this.pg.query(
      `SELECT session_id, app_id, error_count, duration, created_at
       FROM replay_sessions
       WHERE app_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [appId, limit, offset],
    );

    return result.rows;
  }
}

/**
 * ---------------------------------------------------------------
 * @omnisight/shared-types — 会话上下文类型定义
 *
 * 本文件定义了用户会话（Session）相关的 TypeScript 类型。
 * 会话是 OmniSight 系统中关联用户行为的核心概念：
 *   - SDK 在用户首次访问时生成 sessionId（UUID v4），存入 localStorage
 *   - 同一浏览器标签页的连续访问共享同一个 session
 *   - Gateway Worker 在处理事件时会更新 Redis 中的会话上下文缓存
 *   - Console 通过 sessionId 关联错误、行为、录像等数据
 * ---------------------------------------------------------------
 */

/**
 * SessionContext — 用户会话上下文接口
 *
 * 描述一个用户会话的完整上下文信息。
 * 在 Redis 中以 Hash 结构存储，key 为 `session:{sessionId}`，TTL 30 分钟。
 *
 * 用途：
 *   - Gateway Worker 处理事件时，从 Redis 读取/更新会话上下文
 *   - Console 回放页面展示会话的基本信息（时长、访问页面等）
 *   - 用于统计独立用户数（通过 sessionId 去重）
 */
export interface SessionContext {
  /**
   * 会话唯一标识
   * UUID v4 格式，由 SDK 的 session.ts 模块生成。
   * 生成后存入 localStorage，同一标签页的后续访问复用此 ID。
   * 示例: "550e8400-e29b-41d4-a716-446655440000"
   */
  sessionId: string;

  /**
   * 应用唯一标识
   * 标识此会话属于哪个接入 OmniSight 的应用。
   * 与 BaseEvent.appId 对应，用于多项目数据隔离。
   * 示例: "my-web-app"
   */
  appId: string;

  /**
   * 会话首次出现时间（ISO 8601 格式字符串）
   * 该 sessionId 首次上报事件的时间。
   * 由 Gateway Worker 在首次处理该 session 的事件时记录。
   * 示例: "2024-01-15T08:30:00.000Z"
   */
  firstSeen: string;

  /**
   * 会话最后活跃时间（ISO 8601 格式字符串）
   * 该 sessionId 最近一次上报事件的时间。
   * 每次 Gateway Worker 处理该 session 的事件时更新。
   * 用于计算会话时长（lastSeen - firstSeen）和判断会话是否过期。
   * 示例: "2024-01-15T09:15:30.000Z"
   */
  lastSeen: string;

  /**
   * 会话期间访问的页面 URL 列表
   * 按时间顺序记录用户在本次会话中访问过的所有页面。
   * 每当 Gateway Worker 处理到一个新的 URL 时，追加到此数组。
   *
   * 用途：
   *   - Console 回放页面展示用户的页面访问路径
   *   - 用户旅程漏斗分析
   *   - 辅助定位问题发生的上下文（用户是从哪个页面跳转过来的）
   *
   * 示例: ["/home", "/products", "/products/123", "/checkout"]
   */
  urls: string[];
}

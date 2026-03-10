/**
 * ---------------------------------------------------------------
 * @omnisight/shared-types — 统一导出入口
 *
 * 本文件是 @omnisight/shared-types 包的主入口，
 * 将所有子模块的类型定义统一导出，方便其他包通过单一路径引用：
 *
 * @example
 * ```typescript
 * import type {
 *   BaseEvent,
 *   ErrorEvent,
 *   ApiEvent,
 *   VitalEvent,
 *   IngestEvent,
 *   SessionContext,
 * } from '@omnisight/shared-types';
 * ```
 * ---------------------------------------------------------------
 */

/** 导出所有事件相关的类型定义（事件类型枚举、基础事件、各具体事件、联合类型） */
export * from './events';

/** 导出会话上下文相关的类型定义 */
export * from './session';

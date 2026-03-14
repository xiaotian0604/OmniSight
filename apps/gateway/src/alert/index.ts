/**
 * ===============================================================
 * OmniSight Gateway — 告警模块入口
 * ===============================================================
 *
 * 本文件职责：
 * 作为告警模块的统一导出入口，简化其他模块的导入语句。
 *
 * 使用方式：
 * import { AlertModule } from './alert';
 * 而不是：
 * import { AlertModule } from './alert/alert.module';
 *
 * 好处：
 * - 隐藏内部文件结构
 * - 重构时只需修改此文件
 * - 符合模块化设计原则
 *
 * 导出内容：
 * - AlertModule: NestJS 模块定义
 * - AlertService: 核心服务（供外部模块使用）
 * - AlertWorker: 定时任务执行器
 * - 类型定义: 供外部使用
 * ===============================================================
 */

export { AlertModule } from './alert.module';
export { AlertService } from './alert.service';
export { AlertWorker } from './alert.worker';
export * from './types/alert.types';
export type { AlertChannel } from './channels/channel.interface';
export { FeishuChannel } from './channels/feishu.channel';

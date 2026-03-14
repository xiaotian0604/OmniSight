/**
 * ===============================================================
 * OmniSight Gateway — 告警模块常量
 * ===============================================================
 *
 * 本文件职责：
 * 定义告警模块中使用的常量和 InjectionToken。
 *
 * 为什么单独放在一个文件中？
 * - 避免循环依赖：AlertModule 导入 AlertWorker，AlertWorker 不能反向导入 AlertModule
 * - 集中管理：所有常量定义在一处，便于维护
 *
 * 面试要点：
 * - 循环依赖是 NestJS 中常见的问题
 * - 解决方案：将共享的 token/常量提取到独立文件
 * - InjectionToken 用于多例注入（将多个实现收集为数组）
 * ===============================================================
 */

import { InjectionToken } from '@nestjs/common';
import { AlertChannel } from './channels/channel.interface';

/**
 * AlertChannel 注入 Token
 *
 * 使用 InjectionToken 将所有 AlertChannel 实现收集为数组。
 * 这样 AlertWorker 可以注入 AlertChannel[] 获取所有告警渠道。
 *
 * 使用方式：
 * constructor(
 *   @Inject(ALERT_CHANNELS) private readonly channels: AlertChannel[],
 * ) {}
 *
 * 在 Module 中配置：
 * {
 *   provide: ALERT_CHANNELS,
 *   useFactory: (feishu: FeishuChannel) => [feishu],
 *   inject: [FeishuChannel],
 * }
 */
export const ALERT_CHANNELS: InjectionToken<AlertChannel[]> = 'ALERT_CHANNELS';

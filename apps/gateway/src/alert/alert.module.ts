/**
 * ===============================================================
 * OmniSight Gateway — 告警模块
 * ===============================================================
 *
 * 本文件职责：
 * 作为告警功能的 NestJS 模块，负责组装所有告警相关组件。
 *
 * 模块组成：
 * 1. AlertService — 核心业务逻辑（扫描、控频、发送）
 * 2. AlertWorker — 定时任务执行器
 * 3. AlertChannel[] — 告警渠道列表（飞书、钉钉等）
 *
 * 模块设计原则：
 * - 高内聚：告警相关的所有代码都在 alert 目录下
 * - 低耦合：通过接口依赖，方便替换实现
 * - 可扩展：新增告警渠道只需实现 AlertChannel 接口
 *
 * NestJS 模块系统：
 * - @Module 装饰器声明模块
 * - controllers: 暴露 HTTP 接口
 * - providers: 提供服务（Service、Worker、Channel）
 * - imports: 导入其他模块
 * - exports: 导出服务供其他模块使用
 *
 * 依赖注入模式：
 * - AlertService 注入 PG_POOL 和 REDIS
 * - AlertWorker 注入 AlertService 和 AlertChannel[]
 * - AlertChannel 实现类注入 ConfigService
 *
 * 面试要点：
 * - 模块化设计的好处：职责清晰、便于测试、易于维护
 * - 依赖注入的好处：解耦、便于单元测试（可以 mock）
 * - Provider 的作用域：默认是单例（Singleton）
 * - 多例注入：使用 InjectionToken 将多个实现收集为数组
 * ===============================================================
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertService } from './alert.service';
import { AlertWorker } from './alert.worker';
import { AlertChannel } from './channels/channel.interface';
import { FeishuChannel } from './channels/feishu.channel';
import { ALERT_CHANNELS } from './alert.constants';

/**
 * 告警模块定义
 *
 * imports:
 * - ScheduleModule: NestJS 定时任务模块，提供 @Cron 装饰器支持
 *
 * providers:
 * - AlertService: 核心服务，处理扫描和发送逻辑
 * - AlertWorker: 定时任务执行器
 * - FeishuChannel: 飞书告警渠道
 * - ALERT_CHANNELS: 将所有告警渠道收集为数组的 Provider
 *
 * 导出顺序说明：
 * 1. ScheduleModule 必须先导入，否则 @Cron 装饰器不生效
 * 2. AlertChannel 的实现类必须声明为 Provider
 * 3. ALERT_CHANNELS 使用 useFactory 收集所有渠道
 * 4. AlertWorker 依赖 AlertService 和 ALERT_CHANNELS
 *
 * 如何新增告警渠道？
 * 1. 创建新的 Channel 文件（如 dingtalk.channel.ts）
 * 2. 实现 AlertChannel 接口
 * 3. 在 providers 中添加新的 Provider
 * 4. 在 ALERT_CHANNELS 的 useFactory 中添加新渠道
 * 5. 在环境变量中配置渠道参数
 */
@Module({
  imports: [
    /**
     * ScheduleModule — NestJS 定时任务模块
     *
     * 必须导入此模块，@Cron 装饰器才能工作。
     * 内部使用 node-cron 库实现。
     *
     * 特性：
     * - 支持标准 Cron 表达式
     * - 支持动态添加/删除任务
     * - 支持任务持久化（需要额外配置）
     */
    ScheduleModule.forRoot(),
  ],

  providers: [
    /**
     * AlertService — 告警核心服务
     *
     * 职责：
     * - 扫描高频错误（查询 PostgreSQL）
     * - 控频检查（使用 Redis）
     * - 发送告警（调用 AlertChannel）
     */
    AlertService,

    /**
     * FeishuChannel — 飞书告警渠道
     *
     * 实现 AlertChannel 接口，负责发送消息到飞书。
     *
     * 配置：
     * - ALERT_FEISHU_WEBHOOK: 飞书机器人 Webhook URL
     * - ALERT_FEISHU_SECRET: 签名密钥（可选）
     */
    FeishuChannel,

    /**
     * ALERT_CHANNELS — 告警渠道数组 Provider
     *
     * 使用 useFactory 将所有 AlertChannel 实现收集为数组。
     * 这样 AlertWorker 可以通过 @Inject(ALERT_CHANNELS) 注入所有渠道。
     *
     * 新增渠道时，只需在此处添加新的参数和返回值即可。
     */
    {
      provide: ALERT_CHANNELS,
      useFactory: (feishu: FeishuChannel): AlertChannel[] => {
        return [feishu];
      },
      inject: [FeishuChannel],
    },

    /**
     * AlertWorker — 定时任务执行器
     *
     * 职责：
     * - 每 5 分钟执行一次扫描
     * - 调用 AlertService.scanAndAlert()
     * - 记录执行日志
     *
     * 依赖：
     * - AlertService（自动注入）
     * - ALERT_CHANNELS（通过 @Inject 注入）
     */
    AlertWorker,
  ],

  /**
   * exports — 导出的服务
   *
   * 如果其他模块需要使用 AlertService，可以导入 AlertModule。
   * 例如：创建一个 Controller 暴露手动触发告警的 API。
   *
   * 当前设计：
   * AlertWorker 自动执行定时任务，不需要外部调用，
   * 所以暂时不需要导出任何服务。
   */
  exports: [],
})
export class AlertModule {}

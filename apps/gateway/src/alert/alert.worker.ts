/**
 * ===============================================================
 * OmniSight Gateway — 告警定时任务 Worker
 * ===============================================================
 *
 * 本文件职责：
 * 使用 NestJS 的 @Cron 装饰器实现定时任务，定期扫描高频错误并发送告警。
 *
 * 定时任务实现方式：
 * NestJS 提供了两种定时任务方案：
 * 1. @nestjs/schedule - 基于 node-cron，适合简单定时任务
 * 2. Bull Queue + @nestjs/bull - 基于消息队列，支持重试、持久化
 *
 * 本项目选择 @nestjs/schedule 的原因：
 * - 告警任务不需要重试（失败就等下一次）
 * - 不需要持久化（重启后重新开始）
 * - 实现简单，代码量少
 *
 * 面试要点：
 * - Cron 是 Unix 系统的定时任务工具，NestJS 封装了它
 * - 定时任务在单实例中运行，多实例需要加分布式锁
 * - 告警频率要适中：太频繁会打扰，太稀疏会漏掉
 * ===============================================================
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertService } from './alert.service';
import { AlertChannel } from './channels/channel.interface';
import { ALERT_CHANNELS } from './alert.module';

/**
 * 告警定时任务 Worker
 *
 * 使用 @Injectable() 装饰器标记为 NestJS Provider。
 * 通过构造函数注入 AlertService 和所有 AlertChannel。
 *
 * 运行流程：
 * 1. NestJS 启动时自动注册所有 @Cron 方法
 * 2. 到达定时时间时，自动调用 handleAlertScan()
 * 3. handleAlertScan() 调用 AlertService.scanAndAlert()
 * 4. AlertService 执行扫描、控频、发送逻辑
 *
 * 注意事项：
 * - 如果上一次任务还没执行完，下一次任务会等待
 * - 可以通过 @Cron 的 name 参数给任务命名
 * - 可以通过 ScheduleModule 动态添加/删除任务
 */
@Injectable()
export class AlertWorker {
  private readonly logger = new Logger(AlertWorker.name);

  /**
   * 构造函数
   *
   * 注入依赖：
   * - AlertService: 告警核心逻辑
   * - AlertChannel[]: 所有告警渠道（通过 ALERT_CHANNELS 注入）
   *
   * 注意：使用 @Inject(ALERT_CHANNELS) 注入告警渠道数组。
   *
   * @param alertService - 告警服务
   * @param channels - 告警渠道列表
   */
  constructor(
    private readonly alertService: AlertService,
    @Inject(ALERT_CHANNELS) private readonly channels: AlertChannel[],
  ) {
    this.logger.log('告警 Worker 初始化完成');
  }

  /**
   * 定时扫描高频错误
   *
   * 使用 @Cron 装饰器声明定时任务。
   * CronExpression.EVERY_5_MINUTES 是 NestJS 预定义的常量。
   *
   * 执行频率选择：
   * - 1 分钟：实时性高，但数据库压力大
   * - 5 分钟：平衡实时性和性能（推荐）
   * - 15 分钟：性能友好，但可能漏掉短期高频错误
   *
   * 多实例部署问题：
   * 如果部署了多个 Gateway 实例，每个实例都会执行定时任务。
   * 可能导致重复发送告警和数据库查询压力倍增。
   *
   * 解决方案：
   * 1. 使用 Redis 分布式锁（推荐）
   * 2. 只在一个实例上运行告警任务（配置环境变量）
   * 3. 使用专门的 Scheduler 服务
   *
   * 当前实现：
   * 通过 AlertService 中的 Redis 控频机制，即使多实例同时执行，
   * 也只会发送一次告警。
   */
  @Cron(CronExpression.EVERY_5_MINUTES, {
    name: 'alert-scan',
  })
  async handleAlertScan(): Promise<void> {
    this.logger.log('开始执行定时告警扫描...');

    const startTime = Date.now();

    try {
      const result = await this.alertService.scanAndAlert(this.channels);

      const duration = Date.now() - startTime;

      this.logger.log(
        `告警扫描完成: 耗时 ${duration}ms, ` +
          `检测到 ${result.scanResult?.errors.length || 0} 个高频错误, ` +
          `发送 ${result.sentCount} 条告警, ` +
          `跳过 ${result.skippedCount} 条`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`告警扫描执行失败: ${errorMsg}`);
    }
  }

  /**
   * 手动触发告警扫描（用于测试）
   *
   * 提供一个手动触发的方法，方便测试和调试。
   * 可以通过 Controller 暴露为 HTTP 接口。
   *
   * @returns 扫描结果
   */
  async triggerManualScan(): Promise<{
    errors: number;
    sent: number;
    skipped: number;
  }> {
    this.logger.log('手动触发告警扫描');

    const result = await this.alertService.scanAndAlert(this.channels);

    return {
      errors: result.scanResult?.errors.length || 0,
      sent: result.sentCount,
      skipped: result.skippedCount,
    };
  }
}

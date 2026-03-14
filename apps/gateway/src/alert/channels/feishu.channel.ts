/**
 * ===============================================================
 * OmniSight Gateway — 飞书告警渠道
 * ===============================================================
 *
 * 本文件职责：
 * 实现飞书自定义机器人的告警发送功能。
 * 通过 Webhook 发送交互式卡片消息到飞书群组。
 *
 * 飞书机器人工作原理：
 * 1. 在飞书群组中创建自定义机器人
 * 2. 获取 Webhook URL
 * 3. 向 Webhook 发送 POST 请求
 * 4. 飞书服务器将消息推送到群组
 *
 * 安全机制：
 * 飞书支持三种安全设置：
 * 1. 自定义关键词：消息必须包含指定关键词
 * 2. IP 地址白名单：只允许指定 IP 发送
 * 3. 签名验证：使用密钥生成签名（本项目采用此方式）
 *
 * 签名算法：
 * 1. timestamp = 当前时间戳（毫秒）
 * 2. string_to_sign = timestamp + "\n" + secret
 * 3. sign = Base64(HmacSHA256(string_to_sign, secret))
 * 4. 请求中携带 timestamp 和 sign
 *
 * 面试要点：
 * - Webhook 的本质：一个 HTTP 接口，用于接收外部系统的消息
 * - 签名验证的目的：防止伪造请求，确保消息来源可信
 * - HmacSHA256：基于密钥的哈希算法，比普通 SHA256 更安全
 * ===============================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  AlertPayload,
  AlertResult,
  AlertChannelType,
  AlertLevel,
  FeishuConfig,
} from '../types/alert.types';
import {
  AlertChannel,
  FeishuMessage,
  FeishuCard,
} from './channel.interface';

/**
 * 飞书告警渠道实现
 *
 * 使用 @Injectable() 装饰器标记为 NestJS Provider，
 * 可以通过依赖注入在其他类中使用。
 *
 * 实现步骤：
 * 1. 从环境变量读取 Webhook URL 和签名密钥
 * 2. 构建飞书消息卡片
 * 3. 添加签名（如果配置了密钥）
 * 4. 发送 HTTP POST 请求
 * 5. 处理响应和异常
 */
@Injectable()
export class FeishuChannel implements AlertChannel {
  /**
   * NestJS Logger
   * 用于记录日志，自动包含类名前缀。
   */
  private readonly logger = new Logger(FeishuChannel.name);

  /**
   * 飞书机器人配置
   * 从环境变量读取，在构造函数中初始化。
   */
  private readonly config: FeishuConfig;

  /**
   * 构造函数
   *
   * 通过 ConfigService 读取环境变量：
   * - ALERT_FEISHU_WEBHOOK: 飞书机器人 Webhook URL
   * - ALERT_FEISHU_SECRET: 签名密钥（可选）
   *
   * @param configService - NestJS 配置服务
   */
  constructor(private readonly configService: ConfigService) {
    this.config = {
      webhook: this.configService.get<string>('ALERT_FEISHU_WEBHOOK', ''),
      secret: this.configService.get<string>('ALERT_FEISHU_SECRET'),
    };
  }

  /**
   * 获取渠道类型
   *
   * @returns 飞书渠道类型枚举值
   */
  getType(): AlertChannelType {
    return AlertChannelType.FEISHU;
  }

  /**
   * 检查渠道是否可用
   *
   * 检查 Webhook URL 是否配置。
   * 如果 Webhook 为空，则跳过发送。
   *
   * @returns true 表示可以发送
   */
  isAvailable(): boolean {
    return !!this.config.webhook && this.config.webhook.length > 0;
  }

  /**
   * 发送告警消息
   *
   * 核心流程：
   * 1. 构建飞书消息卡片
   * 2. 添加签名（如果配置了密钥）
   * 3. 发送 HTTP POST 请求
   * 4. 解析响应结果
   *
   * @param payload - 告警内容
   * @returns 发送结果
   */
  async send(payload: AlertPayload): Promise<AlertResult> {
    const timestamp = Date.now();

    try {
      if (!this.isAvailable()) {
        this.logger.warn('飞书渠道未配置 Webhook，跳过发送');
        return {
          success: false,
          channel: AlertChannelType.FEISHU,
          error: 'Webhook not configured',
          timestamp: new Date(),
        };
      }

      const message = this.buildMessage(payload) as FeishuMessage & {
        timestamp?: string;
        sign?: string;
      };

      if (this.config.secret) {
        const sign = this.generateSignature(timestamp, this.config.secret);
        message.timestamp = timestamp.toString();
        message.sign = sign;
      }

      this.logger.debug(
        `发送飞书告警: fingerprint=${payload.fingerprint}, count=${payload.count}`,
      );

      const response = await fetch(this.config.webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();

      if (response.ok && result.code === 0) {
        this.logger.log(`飞书告警发送成功: ${payload.fingerprint}`);
        return {
          success: true,
          channel: AlertChannelType.FEISHU,
          timestamp: new Date(),
        };
      } else {
        const errorMsg = result.msg || `HTTP ${response.status}`;
        this.logger.error(`飞书告警发送失败: ${errorMsg}`);
        return {
          success: false,
          channel: AlertChannelType.FEISHU,
          error: errorMsg,
          timestamp: new Date(),
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`飞书告警发送异常: ${errorMsg}`);
      return {
        success: false,
        channel: AlertChannelType.FEISHU,
        error: errorMsg,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 构建飞书消息卡片
   *
   * 飞书卡片消息结构：
   * - header: 卡片头部，包含标题和颜色
   * - elements: 卡片内容，包含错误详情
   *
   * 卡片设计：
   * ┌────────────────────────────────────────┐
   * │ 🚨 错误告警 - ERROR                    │  <- header
   * ├────────────────────────────────────────┤
   * │ 错误信息: Cannot read property...      │  <- element 1
   * │ 文件: src/utils/helper.ts              │  <- element 2
   * │ 发生次数: 156 次                       │  <- element 3
   * │ 影响用户: 23 人                        │  <- element 4
   * │ 时间窗口: 2024-01-15 10:00 ~ 10:05     │  <- element 5
   * │ Git 提交: abc123 (@zhangsan)           │  <- element 6 (可选)
   * ├────────────────────────────────────────┤
   * │ [查看详情]                             │  <- action button
   * └────────────────────────────────────────┘
   *
   * @param payload - 告警内容
   * @returns 飞书消息对象
   */
  private buildMessage(payload: AlertPayload): FeishuMessage {
    const card: FeishuCard = {
      header: {
        title: {
          tag: 'plain_text',
          content: `🚨 错误告警 - ${payload.appId}`,
        },
        template: this.getHeaderColor(payload.level),
      },
      elements: [
        {
          tag: 'markdown',
          content: `**错误信息**\n${this.escapeMarkdown(payload.message)}`,
        },
        {
          tag: 'markdown',
          content: `**文件位置**\n${payload.filename || '未知'}`,
        },
        {
          tag: 'markdown',
          content: `**发生次数**: ${payload.count} 次\n**影响用户**: ${payload.affectedUsers || '未知'} 人`,
        },
        {
          tag: 'markdown',
          content: `**时间窗口**\n${this.formatTimeWindow(payload.windowStart, payload.windowEnd)}`,
        },
      ],
    };

    if (payload.gitCommit || payload.gitAuthor) {
      card.elements.push({
        tag: 'markdown',
        content: `**Git 提交**\n${payload.gitCommit || ''}${payload.gitAuthor ? ` (@${payload.gitAuthor})` : ''}`,
      });
    }

    card.elements.push({
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: `指纹: ${payload.fingerprint} | ${new Date().toLocaleString('zh-CN')}`,
        },
      ],
    });

    return {
      msg_type: 'interactive',
      card,
    };
  }

  /**
   * 根据告警级别获取卡片头部颜色
   *
   * 飞书支持的颜色模板：
   * - red: 红色（严重错误）
   * - orange: 橙色（警告）
   * - yellow: 黄色（注意）
   * - green: 绿色（正常）
   * - blue: 蓝色（信息）
   * - purple: 紫色
   * - grey: 灰色
   *
   * @param level - 告警级别
   * @returns 颜色模板名称
   */
  private getHeaderColor(
    level: AlertLevel,
  ): 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'grey' {
    const colorMap: Record<AlertLevel, 'red' | 'orange' | 'blue'> = {
      [AlertLevel.CRITICAL]: 'red',
      [AlertLevel.ERROR]: 'red',
      [AlertLevel.WARNING]: 'orange',
      [AlertLevel.INFO]: 'blue',
    };
    return colorMap[level] || 'blue';
  }

  /**
   * 生成飞书签名
   *
   * 签名算法：
   * 1. 拼接时间戳和密钥：timestamp + "\n" + secret
   * 2. 使用 HmacSHA256 计算签名
   * 3. Base64 编码
   *
   * 为什么需要签名？
   * - 防止伪造请求：只有知道密钥的人才能生成有效签名
   * - 防止重放攻击：时间戳确保请求的时效性
   *
   * @param timestamp - 当前时间戳（毫秒）
   * @param secret - 签名密钥
   * @returns Base64 编码的签名字符串
   */
  private generateSignature(timestamp: number, secret: string): string {
    const stringToSign = `${timestamp}\n${secret}`;

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(stringToSign);

    return hmac.digest('base64');
  }

  /**
   * 格式化时间窗口
   *
   * 将时间窗口格式化为易读的字符串。
   *
   * @param start - 开始时间
   * @param end - 结束时间
   * @returns 格式化的时间字符串
   */
  private formatTimeWindow(start: Date, end: Date): string {
    const format = (date: Date) =>
      date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    return `${format(start)} ~ ${format(end)}`;
  }

  /**
   * 转义 Markdown 特殊字符
   *
   * 飞书 Markdown 中某些字符有特殊含义，
   * 需要转义以避免解析错误。
   *
   * @param text - 原始文本
   * @returns 转义后的文本
   */
  private escapeMarkdown(text: string): string {
    return text.replace(/([*_`\[\]])/g, '\\$1');
  }
}

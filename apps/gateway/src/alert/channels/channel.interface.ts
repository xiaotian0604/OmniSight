/**
 * ===============================================================
 * OmniSight Gateway — 告警渠道接口
 * ===============================================================
 *
 * 本文件职责：
 * 定义告警渠道的统一接口规范。
 * 所有告警渠道（飞书、钉钉、邮件等）都必须实现此接口。
 *
 * 设计模式：策略模式（Strategy Pattern）
 * - 定义统一的接口规范
 * - 不同渠道是不同的策略实现
 * - AlertService 可以动态切换告警渠道
 *
 * 为什么使用接口而不是抽象类？
 * - TypeScript 的 interface 更轻量
 * - 支持多重实现（一个类可以实现多个接口）
 * - 配合依赖注入更灵活
 *
 * 扩展新渠道步骤：
 * 1. 创建新文件实现此接口（如 slack.channel.ts）
 * 2. 在 AlertModule 中注册新的 Provider
 * 3. 在环境变量中配置渠道参数
 *
 * 面试要点：
 * - 策略模式的核心思想：将算法封装成对象，使它们可以相互替换
 * - 接口的好处：解耦调用者和实现者，便于单元测试和扩展
 * ===============================================================
 */

import {
  AlertPayload,
  AlertResult,
  AlertChannelType,
  FeishuConfig,
  DingtalkConfig,
  EmailConfig,
} from '../types/alert.types';

/**
 * 告警渠道接口
 *
 * 所有告警渠道必须实现的方法：
 * - send(): 发送告警消息
 * - getType(): 返回渠道类型
 * - isAvailable(): 检查渠道是否可用
 *
 * 设计原则：
 * - 单一职责：每个渠道只负责发送消息到对应平台
 * - 开闭原则：对扩展开放（新增渠道），对修改关闭（不影响现有代码）
 * - 依赖倒置：AlertService 依赖此接口，而非具体实现
 */
export interface AlertChannel {
  /**
   * 发送告警消息
   *
   * @param payload — 告警内容，包含错误详情和统计信息
   * @returns 发送结果，包含成功/失败状态和错误信息
   *
   * 实现要求：
   * - 必须处理网络异常，不能让异常向上抛出
   * - 失败时返回 success: false 和具体错误信息
   * - 成功时返回 success: true
   */
  send(payload: AlertPayload): Promise<AlertResult>;

  /**
   * 获取渠道类型
   *
   * 用于日志记录和渠道识别。
   *
   * @returns 渠道类型枚举值
   */
  getType(): AlertChannelType;

  /**
   * 检查渠道是否可用
   *
   * 在发送前检查配置是否完整，避免无效请求。
   * 例如：webhook 为空时返回 false
   *
   * @returns true 表示渠道配置完整，可以发送
   */
  isAvailable(): boolean;
}

/**
 * 飞书消息卡片结构
 *
 * 飞书开放 API 要求的消息格式。
 * 参考：https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN
 *
 * @property msg_type — 消息类型，固定为 'interactive'（交互式卡片）
 * @property card — 卡片内容
 */
export interface FeishuMessage {
  msg_type: 'interactive';
  card: FeishuCard;
}

/**
 * 飞书消息卡片
 *
 * 卡片由多个元素组成，支持丰富的展示效果。
 *
 * @property header — 卡片头部（标题和图标）
 * @property elements — 卡片内容元素列表
 */
export interface FeishuCard {
  header: FeishuCardHeader;
  elements: FeishuCardElement[];
}

/**
 * 飞书卡片头部
 *
 * @property title — 标题
 * @property template — 颜色模板（red/orange/yellow/green/blue/purple/grey）
 */
export interface FeishuCardHeader {
  title: FeishuCardText;
  template: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'grey';
}

/**
 * 飞书卡片文本元素
 *
 * @property tag — 元素类型，固定为 'plain_text' 或 'lark_md'
 * @property content — 文本内容
 */
export interface FeishuCardText {
  tag: 'plain_text' | 'lark_md';
  content: string;
}

/**
 * 飞书卡片元素（联合类型）
 *
 * 卡片支持多种元素类型：
 * - div: 文本块
 * - markdown: Markdown 格式内容
 * - action: 操作按钮
 * - note: 备注信息
 */
export type FeishuCardElement =
  | FeishuCardDiv
  | FeishuCardMarkdown
  | FeishuCardAction
  | FeishuCardNote;

/**
 * 文本块元素
 *
 * @property tag — 固定为 'div'
 * @property text — 文本内容
 */
export interface FeishuCardDiv {
  tag: 'div';
  text: FeishuCardText;
}

/**
 * Markdown 元素
 *
 * 支持 Markdown 语法，用于格式化展示。
 *
 * @property tag — 固定为 'markdown'
 * @property content — Markdown 内容
 */
export interface FeishuCardMarkdown {
  tag: 'markdown';
  content: string;
}

/**
 * 操作按钮元素
 *
 * @property tag — 固定为 'action'
 * @property actions — 按钮列表
 */
export interface FeishuCardAction {
  tag: 'action';
  actions: FeishuCardButton[];
}

/**
 * 按钮配置
 *
 * @property tag — 固定为 'button'
 * @property text — 按钮文本
 * @property url — 跳转链接
 * @property type — 按钮样式（primary/default/danger）
 */
export interface FeishuCardButton {
  tag: 'button';
  text: FeishuCardText;
  url?: string;
  type: 'primary' | 'default' | 'danger';
}

/**
 * 备注元素
 *
 * 显示在卡片底部，通常用于展示时间戳等辅助信息。
 *
 * @property tag — 固定为 'note'
 * @property elements — 备注内容
 */
export interface FeishuCardNote {
  tag: 'note';
  elements: FeishuCardText[];
}

/**
 * 钉钉消息结构（预留）
 *
 * 钉钉机器人支持多种消息类型：
 * - text: 纯文本
 * - markdown: Markdown 格式
 * - link: 链接消息
 * - actionCard: 卡片消息
 *
 * @property msgtype — 消息类型
 * @property text — 文本内容（msgtype='text' 时使用）
 * @property markdown — Markdown 内容（msgtype='markdown' 时使用）
 */
export interface DingtalkMessage {
  msgtype: 'text' | 'markdown' | 'link' | 'actionCard';
  text?: {
    content: string;
  };
  markdown?: {
    title: string;
    text: string;
  };
}

/**
 * 邮件消息结构（预留）
 *
 * @property subject — 邮件主题
 * @property body — 邮件正文（HTML 格式）
 * @property recipients — 收件人列表
 */
export interface EmailMessage {
  subject: string;
  body: string;
  recipients: string[];
}

/**
 * 渠道配置类型映射
 *
 * 用于类型安全的配置获取。
 * 根据 AlertChannelType 返回对应的配置类型。
 */
export type ChannelConfigMap = {
  [AlertChannelType.FEISHU]: FeishuConfig;
  [AlertChannelType.DINGTALK]: DingtalkConfig;
  [AlertChannelType.EMAIL]: EmailConfig;
};

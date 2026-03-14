/**
 * ===============================================================
 * OmniSight Gateway — 告警模块类型定义
 * ===============================================================
 *
 * 本文件职责：
 * 定义告警模块中使用的所有 TypeScript 类型和接口。
 * 集中管理类型定义，便于维护和跨文件复用。
 *
 * 设计理念：
 * 1. 类型安全 — 使用 TypeScript 严格类型，避免运行时错误
 * 2. 可扩展性 — 通过接口定义规范，方便后续扩展新的告警渠道
 * 3. 文档化 — 每个类型都有详细注释，便于理解业务含义
 *
 * 面试要点：
 * - 为什么用 interface 而不是 type？interface 可以被扩展和实现
 * - 为什么用枚举？枚举提供更好的代码提示和类型约束
 * - 为什么用 readonly？防止意外修改配置对象
 * ===============================================================
 */

/**
 * 告警渠道类型枚举
 *
 * 定义系统支持的告警通知渠道。
 * 每种渠道对应一个 Channel 实现类。
 *
 * 扩展新渠道步骤：
 * 1. 在此枚举中添加新类型
 * 2. 实现 AlertChannel 接口
 * 3. 在 AlertService 中注册新渠道
 */
export enum AlertChannelType {
  FEISHU = 'feishu',
  DINGTALK = 'dingtalk',
  EMAIL = 'email',
  SLACK = 'slack',
}

/**
 * 告警级别枚举
 *
 * 不同级别的告警可以有不同的处理策略：
 * - INFO: 普通通知，不需要立即处理
 * - WARNING: 警告，需要关注但不紧急
 * - ERROR: 错误，需要尽快处理
 * - CRITICAL: 严重错误，需要立即处理
 *
 * 当前实现中，所有错误告警默认为 ERROR 级别。
 * 后续可以根据错误频率动态调整级别。
 */
export enum AlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * 告警渠道配置接口
 *
 * 定义单个告警渠道的配置信息。
 * 不同渠道有不同的配置项，使用联合类型区分。
 *
 * @property type — 渠道类型（飞书/钉钉/邮件等）
 * @property enabled — 是否启用该渠道
 * @property config — 渠道特定配置（webhook、token 等）
 */
export interface AlertChannelConfig {
  type: AlertChannelType;
  enabled: boolean;
  config: FeishuConfig | DingtalkConfig | EmailConfig | Record<string, never>;
}

/**
 * 飞书机器人配置
 *
 * 飞书自定义机器人通过 Webhook 发送消息。
 * 支持签名验证，确保消息来源可信。
 *
 * 获取方式：
 * 1. 在飞书群组中添加「自定义机器人」
 * 2. 获取 Webhook URL
 * 3. （可选）设置签名密钥，启用安全验证
 *
 * @property webhook — 飞书机器人 Webhook URL
 * @property secret — 签名密钥（可选，用于安全验证）
 */
export interface FeishuConfig {
  webhook: string;
  secret?: string;
}

/**
 * 钉钉机器人配置（预留）
 *
 * 钉钉机器人同样通过 Webhook 发送消息。
 * 支持加签和关键词两种安全设置。
 *
 * @property webhook — 钉钉机器人 Webhook URL
 * @property secret — 签名密钥（加签模式下必填）
 * @property keywords — 关键词列表（关键词模式下必填）
 */
export interface DingtalkConfig {
  webhook: string;
  secret?: string;
  keywords?: string[];
}

/**
 * 邮件配置（预留）
 *
 * @property smtp — SMTP 服务器地址
 * @property port — SMTP 端口
 * @property user — 发件人邮箱
 * @property password — 邮箱密码或授权码
 * @property recipients — 收件人列表
 */
export interface EmailConfig {
  smtp: string;
  port: number;
  user: string;
  password: string;
  recipients: string[];
}

/**
 * 告警规则配置
 *
 * 定义触发告警的条件和冷却时间。
 * 通过环境变量配置，无需数据库存储。
 *
 * @property threshold — 错误次数阈值，超过此数值触发告警
 * @property windowMinutes — 统计时间窗口（分钟）
 * @property cooldownMinutes — 冷却时间（分钟），同一错误在冷却期内不重复告警
 *
 * 示例配置：
 * - threshold: 100, windowMinutes: 5 → 5 分钟内错误超过 100 次触发告警
 * - cooldownMinutes: 30 → 同一错误 30 分钟内只告警一次
 */
export interface AlertRuleConfig {
  readonly threshold: number;
  readonly windowMinutes: number;
  readonly cooldownMinutes: number;
}

/**
 * 告警消息内容
 *
 * 包含告警的完整信息，用于生成告警消息体。
 * 不同渠道会根据此内容生成不同格式的消息。
 *
 * @property appId — 应用 ID
 * @property fingerprint — 错误指纹
 * @property message — 错误消息
 * @property filename — 错误文件名
 * @property count — 错误次数
 * @property windowStart — 统计窗口开始时间
 * @property windowEnd — 统计窗口结束时间
 * @property firstSeen — 首次发生时间
 * @property lastSeen — 最后发生时间
 * @property gitCommit — Git 提交 hash（可选）
 * @property gitAuthor — Git 提交作者（可选）
 * @property level — 告警级别
 */
export interface AlertPayload {
  appId: string;
  fingerprint: string;
  message: string;
  filename?: string;
  count: number;
  affectedUsers?: number;
  windowStart: Date;
  windowEnd: Date;
  firstSeen: Date;
  lastSeen: Date;
  gitCommit?: string;
  gitAuthor?: string;
  level: AlertLevel;
}

/**
 * 告警发送结果
 *
 * 记录告警发送的状态，用于日志和监控。
 *
 * @property success — 是否发送成功
 * @property channel — 发送渠道
 * @property error — 错误信息（失败时）
 * @property timestamp — 发送时间
 */
export interface AlertResult {
  success: boolean;
  channel: AlertChannelType;
  error?: string;
  timestamp: Date;
}

/**
 * 高频错误检测结果
 *
 * AlertService.scanHighFrequencyErrors() 的返回类型。
 * 包含检测到的所有高频错误列表。
 *
 * @property errors — 高频错误列表
 * @property scannedAt — 扫描时间
 * @property windowStart — 统计窗口开始时间
 * @property windowEnd — 统计窗口结束时间
 */
export interface HighFrequencyErrorScanResult {
  errors: HighFrequencyError[];
  scannedAt: Date;
  windowStart: Date;
  windowEnd: Date;
}

/**
 * 高频错误信息
 *
 * 单个高频错误的详细信息。
 * 从 PostgreSQL 聚合查询结果映射而来。
 *
 * @property fingerprint — 错误指纹
 * @property message — 错误消息
 * @property filename — 错误文件名
 * @property count — 错误次数
 * @property affectedUsers — 影响用户数
 * @property firstSeen — 首次发生时间
 * @property lastSeen — 最后发生时间
 */
export interface HighFrequencyError {
  fingerprint: string;
  message: string;
  filename?: string;
  count: number;
  affectedUsers: number;
  firstSeen: Date;
  lastSeen: Date;
}

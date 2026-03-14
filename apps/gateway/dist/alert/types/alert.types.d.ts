export declare enum AlertChannelType {
    FEISHU = "feishu",
    DINGTALK = "dingtalk",
    EMAIL = "email",
    SLACK = "slack"
}
export declare enum AlertLevel {
    INFO = "info",
    WARNING = "warning",
    ERROR = "error",
    CRITICAL = "critical"
}
export interface AlertChannelConfig {
    type: AlertChannelType;
    enabled: boolean;
    config: FeishuConfig | DingtalkConfig | EmailConfig | Record<string, never>;
}
export interface FeishuConfig {
    webhook: string;
    secret?: string;
}
export interface DingtalkConfig {
    webhook: string;
    secret?: string;
    keywords?: string[];
}
export interface EmailConfig {
    smtp: string;
    port: number;
    user: string;
    password: string;
    recipients: string[];
}
export interface AlertRuleConfig {
    readonly threshold: number;
    readonly windowMinutes: number;
    readonly cooldownMinutes: number;
}
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
export interface AlertResult {
    success: boolean;
    channel: AlertChannelType;
    error?: string;
    timestamp: Date;
}
export interface HighFrequencyErrorScanResult {
    errors: HighFrequencyError[];
    scannedAt: Date;
    windowStart: Date;
    windowEnd: Date;
}
export interface HighFrequencyError {
    fingerprint: string;
    message: string;
    filename?: string;
    count: number;
    affectedUsers: number;
    firstSeen: Date;
    lastSeen: Date;
}

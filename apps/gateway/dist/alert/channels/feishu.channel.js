"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var FeishuChannel_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeishuChannel = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto = __importStar(require("crypto"));
const alert_types_1 = require("../types/alert.types");
let FeishuChannel = FeishuChannel_1 = class FeishuChannel {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(FeishuChannel_1.name);
        this.config = {
            webhook: this.configService.get('ALERT_FEISHU_WEBHOOK', ''),
            secret: this.configService.get('ALERT_FEISHU_SECRET'),
        };
    }
    getType() {
        return alert_types_1.AlertChannelType.FEISHU;
    }
    isAvailable() {
        return !!this.config.webhook && this.config.webhook.length > 0;
    }
    async send(payload) {
        const timestamp = Date.now();
        try {
            if (!this.isAvailable()) {
                this.logger.warn('飞书渠道未配置 Webhook，跳过发送');
                return {
                    success: false,
                    channel: alert_types_1.AlertChannelType.FEISHU,
                    error: 'Webhook not configured',
                    timestamp: new Date(),
                };
            }
            const message = this.buildMessage(payload);
            if (this.config.secret) {
                const sign = this.generateSignature(timestamp, this.config.secret);
                message.timestamp = timestamp.toString();
                message.sign = sign;
            }
            this.logger.debug(`发送飞书告警: fingerprint=${payload.fingerprint}, count=${payload.count}`);
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
                    channel: alert_types_1.AlertChannelType.FEISHU,
                    timestamp: new Date(),
                };
            }
            else {
                const errorMsg = result.msg || `HTTP ${response.status}`;
                this.logger.error(`飞书告警发送失败: ${errorMsg}`);
                return {
                    success: false,
                    channel: alert_types_1.AlertChannelType.FEISHU,
                    error: errorMsg,
                    timestamp: new Date(),
                };
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`飞书告警发送异常: ${errorMsg}`);
            return {
                success: false,
                channel: alert_types_1.AlertChannelType.FEISHU,
                error: errorMsg,
                timestamp: new Date(),
            };
        }
    }
    buildMessage(payload) {
        const card = {
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
    getHeaderColor(level) {
        const colorMap = {
            [alert_types_1.AlertLevel.CRITICAL]: 'red',
            [alert_types_1.AlertLevel.ERROR]: 'red',
            [alert_types_1.AlertLevel.WARNING]: 'orange',
            [alert_types_1.AlertLevel.INFO]: 'blue',
        };
        return colorMap[level] || 'blue';
    }
    generateSignature(timestamp, secret) {
        const stringToSign = `${timestamp}\n${secret}`;
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(stringToSign);
        return hmac.digest('base64');
    }
    formatTimeWindow(start, end) {
        const format = (date) => date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
        return `${format(start)} ~ ${format(end)}`;
    }
    escapeMarkdown(text) {
        return text.replace(/([*_`\[\]])/g, '\\$1');
    }
};
exports.FeishuChannel = FeishuChannel;
exports.FeishuChannel = FeishuChannel = FeishuChannel_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], FeishuChannel);
//# sourceMappingURL=feishu.channel.js.map
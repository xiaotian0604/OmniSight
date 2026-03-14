"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AlertService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const pg_1 = require("pg");
const ioredis_1 = __importDefault(require("ioredis"));
const database_module_1 = require("../database.module");
const alert_types_1 = require("./types/alert.types");
const ALERT_SENT_PREFIX = 'alert:sent:';
let AlertService = AlertService_1 = class AlertService {
    constructor(pg, redis, configService) {
        this.pg = pg;
        this.redis = redis;
        this.configService = configService;
        this.logger = new common_1.Logger(AlertService_1.name);
        this.ruleConfig = {
            threshold: this.configService.get('ALERT_THRESHOLD', 100),
            windowMinutes: this.configService.get('ALERT_WINDOW_MINUTES', 5),
            cooldownMinutes: this.configService.get('ALERT_COOLDOWN_MINUTES', 30),
        };
        this.alertEnabled = this.configService.get('ALERT_ENABLED', 'false').toLowerCase() === 'true';
        this.logger.log(`告警服务初始化: enabled=${this.alertEnabled}, ` +
            `threshold=${this.ruleConfig.threshold}, ` +
            `window=${this.ruleConfig.windowMinutes}min, ` +
            `cooldown=${this.ruleConfig.cooldownMinutes}min`);
    }
    async scanAndAlert(channels) {
        if (!this.alertEnabled) {
            this.logger.debug('告警功能未启用，跳过扫描');
            return { scanResult: null, sentCount: 0, skippedCount: 0 };
        }
        const availableChannels = channels.filter((c) => c.isAvailable());
        if (availableChannels.length === 0) {
            this.logger.warn('没有可用的告警渠道，跳过扫描');
            return { scanResult: null, sentCount: 0, skippedCount: 0 };
        }
        this.logger.log('开始扫描高频错误...');
        const scanResult = await this.scanHighFrequencyErrors();
        if (scanResult.errors.length === 0) {
            this.logger.log('未检测到高频错误');
            return { scanResult, sentCount: 0, skippedCount: 0 };
        }
        this.logger.log(`检测到 ${scanResult.errors.length} 个高频错误，开始处理...`);
        let sentCount = 0;
        let skippedCount = 0;
        for (const error of scanResult.errors) {
            const canSend = await this.checkCooldown('default-app', error.fingerprint);
            if (!canSend) {
                this.logger.debug(`错误 ${error.fingerprint} 在冷却期内，跳过告警`);
                skippedCount++;
                continue;
            }
            const payload = await this.buildAlertPayload(error, scanResult);
            await this.sendToChannels(payload, availableChannels);
            await this.recordAlertSent('default-app', error.fingerprint);
            sentCount++;
        }
        this.logger.log(`告警处理完成: 发送 ${sentCount} 条，跳过 ${skippedCount} 条`);
        return { scanResult, sentCount, skippedCount };
    }
    async scanHighFrequencyErrors() {
        const windowEnd = new Date();
        const windowStart = new Date(windowEnd.getTime() - this.ruleConfig.windowMinutes * 60 * 1000);
        const query = `
      SELECT
        fingerprint,
        payload->>'message' AS message,
        payload->>'filename' AS filename,
        COUNT(*) AS count,
        COUNT(DISTINCT session_id) AS affected_users,
        MIN(ts) AS first_seen,
        MAX(ts) AS last_seen
      FROM events
      WHERE type = 'error'
        AND fingerprint IS NOT NULL
        AND ts >= $1
        AND ts <= $2
      GROUP BY fingerprint, payload->>'message', payload->>'filename'
      HAVING COUNT(*) >= $3
      ORDER BY count DESC
      LIMIT 50
    `;
        const result = await this.pg.query(query, [
            windowStart,
            windowEnd,
            this.ruleConfig.threshold,
        ]);
        const errors = result.rows.map((row) => ({
            fingerprint: row.fingerprint,
            message: row.message || 'Unknown error',
            filename: row.filename,
            count: parseInt(row.count, 10),
            affectedUsers: parseInt(row.affected_users, 10),
            firstSeen: row.first_seen,
            lastSeen: row.last_seen,
        }));
        return {
            errors,
            scannedAt: new Date(),
            windowStart,
            windowEnd,
        };
    }
    async checkCooldown(appId, fingerprint) {
        const key = `${ALERT_SENT_PREFIX}${appId}:${fingerprint}`;
        const result = await this.redis.set(key, Date.now().toString(), 'EX', this.ruleConfig.cooldownMinutes * 60, 'NX');
        return result === 'OK';
    }
    async recordAlertSent(appId, fingerprint) {
        const key = `${ALERT_SENT_PREFIX}${appId}:${fingerprint}`;
        await this.redis.expire(key, this.ruleConfig.cooldownMinutes * 60);
    }
    async buildAlertPayload(error, scanResult) {
        const gitInfo = await this.getGitInfoForError(error);
        return {
            appId: 'default-app',
            fingerprint: error.fingerprint,
            message: error.message,
            filename: error.filename,
            count: error.count,
            windowStart: scanResult.windowStart,
            windowEnd: scanResult.windowEnd,
            firstSeen: error.firstSeen,
            lastSeen: error.lastSeen,
            level: alert_types_1.AlertLevel.ERROR,
            ...gitInfo,
        };
    }
    async getGitInfoForError(error) {
        if (!error.filename) {
            return {};
        }
        try {
            const query = `
        SELECT git_commit, git_author
        FROM sourcemaps
        WHERE filename = $1
        ORDER BY created_at DESC
        LIMIT 1
      `;
            const result = await this.pg.query(query, [error.filename]);
            if (result.rows.length > 0) {
                return {
                    gitCommit: result.rows[0].git_commit,
                    gitAuthor: result.rows[0].git_author,
                };
            }
        }
        catch (err) {
            this.logger.warn(`获取 Git 信息失败: ${err}`);
        }
        return {};
    }
    async sendToChannels(payload, channels) {
        const results = await Promise.all(channels.map((channel) => channel.send(payload)));
        results.forEach((result, index) => {
            if (result.success) {
                this.logger.log(`告警发送成功: channel=${channels[index].getType()}, fingerprint=${payload.fingerprint}`);
            }
            else {
                this.logger.error(`告警发送失败: channel=${channels[index].getType()}, error=${result.error}`);
            }
        });
        return results;
    }
    async triggerAlert(payload, channels) {
        this.logger.log(`手动触发告警: fingerprint=${payload.fingerprint}`);
        return this.sendToChannels(payload, channels);
    }
};
exports.AlertService = AlertService;
exports.AlertService = AlertService = AlertService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_POOL)),
    __param(1, (0, common_1.Inject)(database_module_1.REDIS)),
    __metadata("design:paramtypes", [pg_1.Pool,
        ioredis_1.default,
        config_1.ConfigService])
], AlertService);
//# sourceMappingURL=alert.service.js.map
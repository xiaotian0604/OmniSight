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
const sourcemap_service_1 = require("../sourcemap/sourcemap.service");
const ALERT_SENT_PREFIX = 'alert:sent:';
const ERROR_OCCURRENCES_SQL = `
CASE
  WHEN COALESCE(payload->>'occurrences', '') ~ '^[0-9]+$'
    THEN GREATEST((payload->>'occurrences')::int, 1)
  ELSE 1
END`;
const AFFECTED_AUDIENCE_SQL = `COUNT(DISTINCT COALESCE(NULLIF(payload->>'userId', ''), session_id::text))`;
let AlertService = AlertService_1 = class AlertService {
    constructor(pg, redis, configService, sourcemapService) {
        this.pg = pg;
        this.redis = redis;
        this.configService = configService;
        this.sourcemapService = sourcemapService;
        this.logger = new common_1.Logger(AlertService_1.name);
        this.ruleConfig = {
            threshold: this.configService.get('ALERT_THRESHOLD', 100),
            windowMinutes: this.configService.get('ALERT_WINDOW_MINUTES', 5),
            cooldownMinutes: this.configService.get('ALERT_COOLDOWN_MINUTES', 30),
        };
        this.alertEnabled = this.configService.get('ALERT_ENABLED', 'false').toLowerCase() === 'true';
        this.consoleBaseUrl = this.normalizeBaseUrl(this.configService.get('ALERT_CONSOLE_BASE_URL', '').trim()) || undefined;
        this.logger.log(`告警服务初始化: enabled=${this.alertEnabled}, ` +
            `threshold=${this.ruleConfig.threshold}, ` +
            `window=${this.ruleConfig.windowMinutes}min, ` +
            `cooldown=${this.ruleConfig.cooldownMinutes}min, ` +
            `consoleBaseUrl=${this.consoleBaseUrl || 'disabled'}`);
    }
    async scanAndAlert(channels) {
        if (!this.alertEnabled) {
            this.logger.debug('告警功能未启用，跳过扫描');
            return { scanResult: null, sentCount: 0, skippedCount: 0, failedCount: 0 };
        }
        const availableChannels = channels.filter((c) => c.isAvailable());
        if (availableChannels.length === 0) {
            this.logger.warn('没有可用的告警渠道，跳过扫描');
            return { scanResult: null, sentCount: 0, skippedCount: 0, failedCount: 0 };
        }
        this.logger.log('开始扫描高频错误...');
        const scanResult = await this.scanHighFrequencyErrors();
        if (scanResult.errors.length === 0) {
            this.logger.log('未检测到高频错误');
            return { scanResult, sentCount: 0, skippedCount: 0, failedCount: 0 };
        }
        this.logger.log(`检测到 ${scanResult.errors.length} 个高频错误，开始处理...`);
        let sentCount = 0;
        let skippedCount = 0;
        let failedCount = 0;
        for (const error of scanResult.errors) {
            const canSend = await this.checkCooldown(error.appId, error.fingerprint);
            if (!canSend) {
                this.logger.debug(`错误 ${error.fingerprint} 在冷却期内，跳过告警`);
                skippedCount++;
                continue;
            }
            const payload = await this.buildAlertPayload(error, scanResult);
            const results = await this.sendToChannels(payload, availableChannels);
            const hasSuccess = results.some((result) => result.success);
            if (!hasSuccess) {
                await this.releaseCooldown(error.appId, error.fingerprint);
                failedCount++;
                continue;
            }
            await this.recordAlertSent(error.appId, error.fingerprint);
            sentCount++;
        }
        this.logger.log(`告警处理完成: 发送 ${sentCount} 条，失败 ${failedCount} 条，跳过 ${skippedCount} 条`);
        return { scanResult, sentCount, skippedCount, failedCount };
    }
    async scanHighFrequencyErrors() {
        const windowEnd = new Date();
        const windowStart = new Date(windowEnd.getTime() - this.ruleConfig.windowMinutes * 60 * 1000);
        const query = `
      SELECT
        app_id AS app_id,
        fingerprint,
        (ARRAY_AGG(session_id ORDER BY ts DESC))[1] AS session_id,
        (ARRAY_AGG(payload->>'message' ORDER BY ts DESC))[1] AS message,
        (ARRAY_AGG(payload->>'release' ORDER BY ts DESC))[1] AS release,
        (ARRAY_AGG(payload->>'filename' ORDER BY ts DESC))[1] AS filename,
        (ARRAY_AGG(payload->>'lineno' ORDER BY ts DESC))[1] AS lineno,
        (ARRAY_AGG(payload->>'colno' ORDER BY ts DESC))[1] AS colno,
        SUM(${ERROR_OCCURRENCES_SQL}) AS count,
        ${AFFECTED_AUDIENCE_SQL} AS affected_users,
        MIN(ts) AS first_seen,
        MAX(ts) AS last_seen
      FROM events
      WHERE type = 'error'
        AND fingerprint IS NOT NULL
        AND ts >= $1
        AND ts <= $2
      GROUP BY app_id, fingerprint
      HAVING SUM(${ERROR_OCCURRENCES_SQL}) >= $3
      ORDER BY count DESC
      LIMIT 50
    `;
        const result = await this.pg.query(query, [
            windowStart,
            windowEnd,
            this.ruleConfig.threshold,
        ]);
        const errors = result.rows.map((row) => ({
            appId: row.app_id,
            fingerprint: row.fingerprint,
            message: row.message || 'Unknown error',
            sessionId: row.session_id || undefined,
            release: row.release || undefined,
            filename: row.filename,
            lineno: this.parseOptionalNumber(row.lineno),
            colno: this.parseOptionalNumber(row.colno),
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
    async releaseCooldown(appId, fingerprint) {
        const key = `${ALERT_SENT_PREFIX}${appId}:${fingerprint}`;
        await this.redis.del(key);
    }
    async buildAlertPayload(error, scanResult) {
        const resolvedSource = await this.sourcemapService.resolveLocation({
            appId: error.appId,
            release: error.release,
            filename: error.filename,
            lineno: error.lineno,
            colno: error.colno,
        });
        const replaySessionId = error.sessionId
            ? await this.getReplaySessionId(error.sessionId, error.appId)
            : undefined;
        return {
            appId: error.appId,
            fingerprint: error.fingerprint,
            message: error.message,
            sessionId: error.sessionId,
            filename: error.filename,
            lineno: error.lineno,
            colno: error.colno,
            release: error.release || resolvedSource?.release,
            count: error.count,
            affectedUsers: error.affectedUsers,
            detailUrl: this.buildConsoleDetailUrl(error, scanResult),
            replayUrl: replaySessionId
                ? this.buildConsoleReplayUrl(replaySessionId, error.appId, scanResult)
                : undefined,
            windowStart: scanResult.windowStart,
            windowEnd: scanResult.windowEnd,
            firstSeen: error.firstSeen,
            lastSeen: error.lastSeen,
            level: alert_types_1.AlertLevel.ERROR,
            gitCommit: resolvedSource?.gitCommit,
            gitAuthor: resolvedSource?.gitAuthor,
            gitMessage: resolvedSource?.gitMessage,
            gitBranch: resolvedSource?.gitBranch,
            resolvedFile: resolvedSource?.originalFile,
            resolvedLine: resolvedSource?.originalLine,
            resolvedColumn: resolvedSource?.originalColumn,
            sourceContext: resolvedSource?.sourceContext,
        };
    }
    normalizeBaseUrl(url) {
        if (!url) {
            return null;
        }
        const normalized = url.replace(/\/+$/, '');
        if (!/^https?:\/\//i.test(normalized)) {
            return `http://${normalized}`;
        }
        return normalized;
    }
    buildConsoleDetailUrl(error, scanResult) {
        if (!this.consoleBaseUrl) {
            return undefined;
        }
        try {
            const url = new URL(`${this.consoleBaseUrl}/errors/${encodeURIComponent(error.fingerprint)}`);
            url.searchParams.set('appId', error.appId);
            url.searchParams.set('from', scanResult.windowStart.toISOString());
            url.searchParams.set('to', scanResult.windowEnd.toISOString());
            return url.toString();
        }
        catch {
            return undefined;
        }
    }
    buildConsoleReplayUrl(sessionId, appId, scanResult) {
        if (!this.consoleBaseUrl) {
            return undefined;
        }
        try {
            const url = new URL(`${this.consoleBaseUrl}/replay/player/${encodeURIComponent(sessionId)}`);
            url.searchParams.set('appId', appId);
            url.searchParams.set('from', scanResult.windowStart.toISOString());
            url.searchParams.set('to', scanResult.windowEnd.toISOString());
            return url.toString();
        }
        catch {
            return undefined;
        }
    }
    async getReplaySessionId(sessionId, appId) {
        const result = await this.pg.query(`SELECT session_id
       FROM replay_sessions
       WHERE session_id = $1
         AND app_id = $2
       LIMIT 1`, [sessionId, appId]);
        return result.rows[0]?.session_id || undefined;
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
    parseOptionalNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim().length > 0) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return undefined;
    }
};
exports.AlertService = AlertService;
exports.AlertService = AlertService = AlertService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_POOL)),
    __param(1, (0, common_1.Inject)(database_module_1.REDIS)),
    __metadata("design:paramtypes", [pg_1.Pool,
        ioredis_1.default,
        config_1.ConfigService,
        sourcemap_service_1.SourcemapService])
], AlertService);
//# sourceMappingURL=alert.service.js.map
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const database_module_1 = require("../database.module");
const sourcemap_service_1 = require("../sourcemap/sourcemap.service");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_OCCURRENCES_SQL = `
CASE
  WHEN COALESCE(payload->>'occurrences', '') ~ '^[0-9]+$'
    THEN GREATEST((payload->>'occurrences')::int, 1)
  ELSE 1
END`;
const ERROR_WEIGHT_SQL = `
CASE
  WHEN type = 'error' THEN ${ERROR_OCCURRENCES_SQL}
  ELSE 0
END`;
const EVENT_WEIGHT_SQL = `
CASE
  WHEN type = 'error' THEN ${ERROR_OCCURRENCES_SQL}
  ELSE 1
END`;
const AFFECTED_AUDIENCE_SQL = `COUNT(DISTINCT COALESCE(NULLIF(payload->>'userId', ''), session_id::text))`;
let QueryService = class QueryService {
    constructor(pg, sourcemapService) {
        this.pg = pg;
        this.sourcemapService = sourcemapService;
    }
    async getErrorRateSeries(appId, from, to, interval = '5 minutes') {
        try {
            const result = await this.pg.query(`SELECT
           time_bucket($4::interval, ts) AS bucket,
           SUM(${ERROR_WEIGHT_SQL}) AS error_count,
           SUM(${EVENT_WEIGHT_SQL}) AS total_count,
           ROUND(
             SUM(${ERROR_WEIGHT_SQL})::numeric / GREATEST(SUM(${EVENT_WEIGHT_SQL}), 1) * 100, 2
           ) AS error_rate
         FROM events
         WHERE app_id = $1
           AND ts >= $2::timestamptz
           AND ts <= $3::timestamptz
         GROUP BY bucket
         ORDER BY bucket`, [appId, from, to, interval]);
            return result.rows;
        }
        catch (err) {
            if (err.message &&
                err.message.includes('time_bucket') &&
                err.message.includes('does not exist')) {
                const truncPrecision = this.intervalToTruncPrecision(interval);
                const result = await this.pg.query(`SELECT
             date_trunc($4, ts) AS bucket,
             SUM(${ERROR_WEIGHT_SQL}) AS error_count,
             SUM(${EVENT_WEIGHT_SQL}) AS total_count,
             ROUND(
               SUM(${ERROR_WEIGHT_SQL})::numeric / GREATEST(SUM(${EVENT_WEIGHT_SQL}), 1) * 100, 2
             ) AS error_rate
           FROM events
           WHERE app_id = $1
             AND ts >= $2::timestamptz
             AND ts <= $3::timestamptz
           GROUP BY bucket
           ORDER BY bucket`, [appId, from, to, truncPrecision]);
                return result.rows;
            }
            throw err;
        }
    }
    intervalToTruncPrecision(interval) {
        const lower = interval.toLowerCase();
        if (lower.includes('minute'))
            return 'minute';
        if (lower.includes('hour'))
            return 'hour';
        if (lower.includes('day'))
            return 'day';
        return 'hour';
    }
    async getAppsList() {
        const result = await this.pg.query(`SELECT
         app_id AS "appId",
         SUM(${ERROR_WEIGHT_SQL}) AS "errorCount",
         SUM(${EVENT_WEIGHT_SQL}) AS "totalCount",
         MAX(ts) AS "lastSeen"
       FROM events
       GROUP BY app_id
       ORDER BY MAX(ts) DESC`);
        return result.rows;
    }
    async getErrorsGrouped(appId, from, to, limit = 50, sortBy = 'count', offset = 0) {
        const orderBy = sortBy === 'lastSeen' ? '"lastSeen" DESC' : '"count" DESC';
        const result = await this.pg.query(`SELECT
         fingerprint,
         (ARRAY_AGG(payload->>'message' ORDER BY ts DESC))[1] AS message,
         (ARRAY_AGG(payload->>'filename' ORDER BY ts DESC))[1] AS filename,
         SUM(${ERROR_OCCURRENCES_SQL}) AS "count",
         ${AFFECTED_AUDIENCE_SQL} AS "affectedUsers",
         MAX(ts)               AS "lastSeen",
         MIN(ts)               AS "firstSeen"
       FROM events
       WHERE app_id = $1
         AND type = 'error'
         AND ts >= $2::timestamptz
         AND ts <= $3::timestamptz
       GROUP BY fingerprint
       ORDER BY ${orderBy}
       LIMIT $4
       OFFSET $5`, [appId, from, to, limit, offset]);
        return result.rows;
    }
    async getErrorDetail(identifier, appId) {
        const event = await this.findErrorEvent(identifier, appId);
        if (!event) {
            return null;
        }
        const aggregate = event.fingerprint
            ? await this.getErrorAggregate(event.app_id, event.fingerprint)
            : {
                count: 1,
                affectedUsers: 1,
                firstSeen: event.ts,
                lastSeen: event.ts,
            };
        const breadcrumbs = await this.getBreadcrumbs(event.app_id, event.session_id, event.ts);
        const replaySessionId = await this.getReplaySessionId(event.session_id, event.app_id);
        const release = this.readStringPayloadField(event.payload, 'release');
        const filename = this.readStringPayloadField(event.payload, 'filename');
        const lineno = this.readNumberPayloadField(event.payload, 'lineno');
        const colno = this.readNumberPayloadField(event.payload, 'colno');
        const rawStack = this.readStringPayloadField(event.payload, 'stack') || undefined;
        const resolvedSource = await this.sourcemapService.resolveLocation({
            appId: event.app_id,
            release: release || undefined,
            filename: filename || undefined,
            lineno: lineno || undefined,
            colno: colno || undefined,
        });
        const mappedStackFrames = await this.sourcemapService.resolveStack({
            appId: event.app_id,
            release: release || undefined,
            stack: rawStack,
        });
        return {
            fingerprint: event.fingerprint || identifier,
            message: this.readStringPayloadField(event.payload, 'message') || 'Unknown error',
            stack: rawStack,
            rawStack,
            mappedStackFrames,
            filename: filename || undefined,
            lineno: lineno || undefined,
            colno: colno || undefined,
            release: release || resolvedSource?.release,
            count: aggregate.count,
            affectedUsers: aggregate.affectedUsers,
            firstSeen: aggregate.firstSeen,
            lastSeen: aggregate.lastSeen,
            breadcrumbs,
            replaySessionId,
            sourceMap: resolvedSource,
            tags: {
                appId: event.app_id,
                sessionId: event.session_id,
                ...(event.url ? { url: event.url } : {}),
                ...(event.ua ? { ua: event.ua } : {}),
                ...(release || resolvedSource?.release
                    ? { release: release || resolvedSource?.release }
                    : {}),
                ...(resolvedSource?.gitCommit ? { gitCommit: resolvedSource.gitCommit } : {}),
                ...(resolvedSource?.gitAuthor ? { gitAuthor: resolvedSource.gitAuthor } : {}),
                ...(resolvedSource?.gitBranch ? { gitBranch: resolvedSource.gitBranch } : {}),
            },
        };
    }
    async findErrorEvent(identifier, appId) {
        if (appId) {
            const byFingerprint = await this.pg.query(`SELECT *
         FROM events
         WHERE app_id = $1
           AND type = 'error'
           AND fingerprint = $2
         ORDER BY ts DESC
         LIMIT 1`, [appId, identifier]);
            if (byFingerprint.rows[0]) {
                return byFingerprint.rows[0];
            }
        }
        if (!UUID_PATTERN.test(identifier)) {
            return null;
        }
        const byId = await this.pg.query('SELECT * FROM events WHERE id = $1 AND type = $2 LIMIT 1', [identifier, 'error']);
        if (byId.rows[0]) {
            return byId.rows[0];
        }
        return null;
    }
    async getErrorAggregate(appId, fingerprint) {
        const result = await this.pg.query(`SELECT
         SUM(${ERROR_OCCURRENCES_SQL}) AS count,
         ${AFFECTED_AUDIENCE_SQL} AS "affectedUsers",
         MIN(ts) AS "firstSeen",
         MAX(ts) AS "lastSeen"
       FROM events
       WHERE app_id = $1
         AND type = 'error'
         AND fingerprint = $2`, [appId, fingerprint]);
        const row = result.rows[0];
        return {
            count: parseInt(row?.count ?? '0', 10),
            affectedUsers: parseInt(row?.affectedUsers ?? '0', 10),
            firstSeen: row?.firstSeen ?? null,
            lastSeen: row?.lastSeen ?? null,
        };
    }
    async getReplaySessionId(sessionId, appId) {
        const result = await this.pg.query(`SELECT session_id
       FROM replay_sessions
       WHERE session_id = $1
         AND ($2::text IS NULL OR app_id = $2)
       LIMIT 1`, [sessionId, appId ?? null]);
        return result.rows[0]?.session_id;
    }
    async getBreadcrumbs(appId, sessionId, eventTime) {
        const result = await this.pg.query(`SELECT type, payload, ts
       FROM events
       WHERE app_id = $1
         AND session_id = $2
         AND ts <= $3::timestamptz
         AND ts >= $3::timestamptz - interval '30 minutes'
         AND type IN ('behavior', 'api', 'error')
       ORDER BY ts DESC
       LIMIT 20`, [appId, sessionId, eventTime]);
        return result.rows
            .map((row) => this.mapBreadcrumb(row))
            .filter((item) => item !== null)
            .reverse();
    }
    mapBreadcrumb(row) {
        if (row.type === 'behavior') {
            const subType = row.payload?.subType;
            if (subType === 'click') {
                const text = row.payload?.data?.text ? ` ${row.payload.data.text}` : '';
                return {
                    type: 'click',
                    message: `点击 ${row.payload?.data?.tagName || 'unknown'}${text}`.trim(),
                    timestamp: row.ts,
                    data: row.payload?.data,
                };
            }
            if (subType === 'route-change') {
                return {
                    type: 'navigation',
                    message: `${row.payload?.data?.from || 'unknown'} -> ${row.payload?.data?.to || 'unknown'}`,
                    timestamp: row.ts,
                    data: row.payload?.data,
                };
            }
        }
        if (row.type === 'api') {
            return {
                type: 'xhr',
                message: `${row.payload?.method || 'GET'} ${row.payload?.apiUrl || 'unknown'}`,
                timestamp: row.ts,
                data: {
                    status: row.payload?.status,
                    duration: row.payload?.duration,
                },
            };
        }
        if (row.type === 'error') {
            return {
                type: 'error',
                message: row.payload?.message || 'Unknown error',
                timestamp: row.ts,
            };
        }
        return null;
    }
    readStringPayloadField(payload, key) {
        const value = payload?.[key];
        return typeof value === 'string' && value.length > 0 ? value : null;
    }
    readNumberPayloadField(payload, key) {
        const value = payload?.[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim().length > 0) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return null;
    }
    async getApiMetrics(appId, from, to, limit = 20) {
        const result = await this.pg.query(`SELECT
         payload->>'apiUrl' AS endpoint,
         payload->>'method' AS method,
         percentile_cont(0.50) WITHIN GROUP (
           ORDER BY COALESCE((payload->>'duration')::float, 0)
         ) AS p50,
         percentile_cont(0.75) WITHIN GROUP (
           ORDER BY COALESCE((payload->>'duration')::float, 0)
         ) AS p75,
         percentile_cont(0.99) WITHIN GROUP (
           ORDER BY COALESCE((payload->>'duration')::float, 0)
         ) AS p99,
         COUNT(*) AS count,
         ROUND(
           COUNT(*) FILTER (
             WHERE COALESCE((payload->>'status')::int, 0) >= 400
           )::numeric / GREATEST(COUNT(*), 1) * 100, 1
         ) AS "errorRate"
       FROM events
       WHERE app_id = $1
         AND type = 'api'
         AND ts >= $2::timestamptz
         AND ts <= $3::timestamptz
       GROUP BY payload->>'apiUrl', payload->>'method'
       ORDER BY p99 DESC
       LIMIT $4`, [appId, from, to, limit]);
        return result.rows;
    }
    async getVitalsSeries(appId, from, to, name, interval = '1 hour') {
        const params = [appId, from, to, interval];
        let nameFilter = '';
        if (name) {
            nameFilter = `AND payload->>'name' = $5`;
            params.push(name);
        }
        try {
            const result = await this.pg.query(`SELECT
           time_bucket($4::interval, ts) AS bucket,
           payload->>'name' AS name,
           AVG(COALESCE((payload->>'value')::float, 0)) AS avg_value,
           COUNT(*) AS sample_count
         FROM events
         WHERE app_id = $1
           AND type = 'vital'
           AND ts >= $2::timestamptz
           AND ts <= $3::timestamptz
           ${nameFilter}
         GROUP BY bucket, payload->>'name'
         ORDER BY bucket`, params);
            return result.rows;
        }
        catch (err) {
            if (err.message &&
                err.message.includes('time_bucket') &&
                err.message.includes('does not exist')) {
                const truncPrecision = this.intervalToTruncPrecision(interval);
                const fallbackParams = [appId, from, to, truncPrecision];
                let fallbackNameFilter = '';
                if (name) {
                    fallbackNameFilter = `AND payload->>'name' = $5`;
                    fallbackParams.push(name);
                }
                const result = await this.pg.query(`SELECT
             date_trunc($4, ts) AS bucket,
             payload->>'name' AS name,
             AVG(COALESCE((payload->>'value')::float, 0)) AS avg_value,
             COUNT(*) AS sample_count
           FROM events
           WHERE app_id = $1
             AND type = 'vital'
             AND ts >= $2::timestamptz
             AND ts <= $3::timestamptz
             ${fallbackNameFilter}
           GROUP BY bucket, payload->>'name'
           ORDER BY bucket`, fallbackParams);
                return result.rows;
            }
            throw err;
        }
    }
};
exports.QueryService = QueryService;
exports.QueryService = QueryService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_POOL)),
    __metadata("design:paramtypes", [pg_1.Pool,
        sourcemap_service_1.SourcemapService])
], QueryService);
//# sourceMappingURL=query.service.js.map
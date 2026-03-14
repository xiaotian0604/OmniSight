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
let QueryService = class QueryService {
    constructor(pg) {
        this.pg = pg;
    }
    async getErrorRateSeries(appId, from, to, interval = '5 minutes') {
        try {
            const result = await this.pg.query(`SELECT
           time_bucket($4::interval, ts) AS bucket,
           COUNT(*) FILTER (WHERE type = 'error') AS error_count,
           COUNT(*) AS total_count,
           ROUND(
             COUNT(*) FILTER (WHERE type = 'error')::numeric / GREATEST(COUNT(*), 1) * 100, 2
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
             COUNT(*) FILTER (WHERE type = 'error') AS error_count,
             COUNT(*) AS total_count,
             ROUND(
               COUNT(*) FILTER (WHERE type = 'error')::numeric / GREATEST(COUNT(*), 1) * 100, 2
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
    async getErrorsGrouped(appId, from, to, limit = 50) {
        const result = await this.pg.query(`SELECT
         fingerprint,
         payload->>'message' AS message,
         payload->>'filename' AS filename,
         COUNT(*)              AS count,
         COUNT(DISTINCT session_id) AS affected_users,
         MAX(ts)               AS last_seen,
         MIN(ts)               AS first_seen
       FROM events
       WHERE app_id = $1
         AND type = 'error'
         AND ts >= $2::timestamptz
         AND ts <= $3::timestamptz
       GROUP BY fingerprint, payload->>'message', payload->>'filename'
       ORDER BY count DESC
       LIMIT $4`, [appId, from, to, limit]);
        return result.rows;
    }
    async getErrorById(eventId) {
        const result = await this.pg.query('SELECT * FROM events WHERE id = $1 AND type = $2 LIMIT 1', [eventId, 'error']);
        const event = result.rows[0] || null;
        if (!event) {
            return null;
        }
        const filename = event.payload?.filename;
        if (filename) {
            const gitResult = await this.pg.query(`SELECT git_commit, git_author, git_message, git_branch
         FROM sourcemaps
         WHERE filename = $1
         ORDER BY created_at DESC
         LIMIT 1`, [filename]);
            if (gitResult.rows.length > 0) {
                event.git = {
                    commit: gitResult.rows[0].git_commit,
                    author: gitResult.rows[0].git_author,
                    message: gitResult.rows[0].git_message,
                    branch: gitResult.rows[0].git_branch,
                };
            }
        }
        return event;
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
    __metadata("design:paramtypes", [pg_1.Pool])
], QueryService);
//# sourceMappingURL=query.service.js.map
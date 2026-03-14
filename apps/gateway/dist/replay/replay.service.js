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
exports.ReplayService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const database_module_1 = require("../database.module");
let ReplayService = class ReplayService {
    constructor(pg) {
        this.pg = pg;
    }
    async save(sessionId, appId, events, errorCount = 1) {
        const duration = events.length > 1
            ? events[events.length - 1].timestamp - events[0].timestamp
            : 0;
        const result = await this.pg.query(`INSERT INTO replay_sessions (session_id, app_id, events, error_count, duration)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (session_id) DO UPDATE SET
         events = replay_sessions.events || $3::jsonb,
         error_count = replay_sessions.error_count + $4,
         duration = GREATEST(replay_sessions.duration, $5)
       RETURNING *`, [sessionId, appId, JSON.stringify(events), errorCount, duration]);
        return result.rows[0];
    }
    async getBySessionId(sessionId) {
        const result = await this.pg.query('SELECT * FROM replay_sessions WHERE session_id = $1', [sessionId]);
        if (result.rows.length === 0) {
            throw new common_1.NotFoundException(`未找到会话 ID 为 ${sessionId} 的录像记录`);
        }
        return result.rows[0];
    }
    async list(appId, limit = 20, offset = 0) {
        const result = await this.pg.query(`SELECT session_id, app_id, error_count, duration, created_at
       FROM replay_sessions
       WHERE app_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`, [appId, limit, offset]);
        return result.rows;
    }
};
exports.ReplayService = ReplayService;
exports.ReplayService = ReplayService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_POOL)),
    __metadata("design:paramtypes", [pg_1.Pool])
], ReplayService);
//# sourceMappingURL=replay.service.js.map
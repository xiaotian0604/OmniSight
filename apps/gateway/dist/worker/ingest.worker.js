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
var IngestWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestWorker = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const ioredis_1 = __importDefault(require("ioredis"));
const database_module_1 = require("../database.module");
const DEDUP_PREFIX = 'dedup:';
const DEDUP_TTL_SECONDS = 3600;
let IngestWorker = IngestWorker_1 = class IngestWorker {
    constructor(pg, redis) {
        this.pg = pg;
        this.redis = redis;
        this.logger = new common_1.Logger(IngestWorker_1.name);
    }
    async handleIngestJob(job) {
        this.logger.log(`开始处理 Job #${job.id}，包含 ${job.data.length} 个事件`);
        let insertedCount = 0;
        let dedupCount = 0;
        for (const event of job.data) {
            if (event.fingerprint) {
                const dedupKey = `${DEDUP_PREFIX}${event.appId}:${event.fingerprint}`;
                const setResult = await this.redis.set(dedupKey, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
                if (setResult === null) {
                    dedupCount++;
                    continue;
                }
            }
            const enrichedEvent = this.enrich(event);
            await this.pg.query(`INSERT INTO events (app_id, session_id, type, ts, fingerprint, payload, url, ua, country, city)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5, $6, $7, $8, $9, $10)`, [
                enrichedEvent.appId,
                enrichedEvent.sessionId,
                enrichedEvent.type,
                enrichedEvent.ts,
                enrichedEvent.fingerprint || null,
                JSON.stringify(enrichedEvent.payload || enrichedEvent),
                enrichedEvent.url || null,
                enrichedEvent.ua || null,
                enrichedEvent.country || null,
                enrichedEvent.city || null,
            ]);
            insertedCount++;
        }
        this.logger.log(`Job #${job.id} 处理完成：写入 ${insertedCount} 条，去重跳过 ${dedupCount} 条`);
    }
    enrich(event) {
        return event;
    }
};
exports.IngestWorker = IngestWorker;
__decorate([
    (0, bull_1.Process)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IngestWorker.prototype, "handleIngestJob", null);
exports.IngestWorker = IngestWorker = IngestWorker_1 = __decorate([
    (0, bull_1.Processor)('ingest'),
    __param(0, (0, common_1.Inject)(database_module_1.PG_POOL)),
    __param(1, (0, common_1.Inject)(database_module_1.REDIS)),
    __metadata("design:paramtypes", [pg_1.Pool,
        ioredis_1.default])
], IngestWorker);
//# sourceMappingURL=ingest.worker.js.map
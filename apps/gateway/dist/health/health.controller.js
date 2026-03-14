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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const pg_1 = require("pg");
const ioredis_1 = __importDefault(require("ioredis"));
const database_module_1 = require("../database.module");
let HealthController = class HealthController {
    constructor(pg, redis) {
        this.pg = pg;
        this.redis = redis;
    }
    async check() {
        let pgStatus;
        try {
            await this.pg.query('SELECT 1');
            pgStatus = 'connected';
        }
        catch (err) {
            pgStatus = `error: ${err.message}`;
        }
        let redisStatus;
        try {
            const pong = await this.redis.ping();
            redisStatus = pong === 'PONG' ? 'connected' : `unexpected: ${pong}`;
        }
        catch (err) {
            redisStatus = `error: ${err.message}`;
        }
        const isHealthy = pgStatus === 'connected' && redisStatus === 'connected';
        return {
            status: isHealthy ? 'ok' : 'error',
            postgres: pgStatus,
            redis: redisStatus,
            uptime: Math.floor(process.uptime()),
        };
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: '健康检查',
        description: '检查 Gateway 服务及 PostgreSQL、Redis 的连通性。' +
            '用于 Docker/K8s 探针和服务状态验证。不需要鉴权。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '健康检查结果',
        schema: {
            properties: {
                status: { type: 'string', example: 'ok' },
                postgres: { type: 'string', example: 'connected' },
                redis: { type: 'string', example: 'connected' },
                uptime: { type: 'number', example: 12345, description: '进程运行时长（秒）' },
            },
        },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "check", null);
exports.HealthController = HealthController = __decorate([
    (0, swagger_1.ApiTags)('健康检查'),
    (0, common_1.Controller)('health'),
    __param(0, (0, common_1.Inject)(database_module_1.PG_POOL)),
    __param(1, (0, common_1.Inject)(database_module_1.REDIS)),
    __metadata("design:paramtypes", [pg_1.Pool,
        ioredis_1.default])
], HealthController);
//# sourceMappingURL=health.controller.js.map
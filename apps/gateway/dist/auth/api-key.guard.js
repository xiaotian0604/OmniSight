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
exports.ApiKeyGuard = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const ioredis_1 = __importDefault(require("ioredis"));
const database_module_1 = require("../database.module");
const CACHE_PREFIX = 'apikey:';
const CACHE_TTL_SECONDS = 300;
let ApiKeyGuard = class ApiKeyGuard {
    constructor(pg, redis) {
        this.pg = pg;
        this.redis = redis;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const apiKey = request.headers['x-api-key'];
        if (!apiKey) {
            throw new common_1.UnauthorizedException('缺少 x-api-key Header，请在 SDK init 时配置正确的 apiKey');
        }
        const cacheKey = `${CACHE_PREFIX}${apiKey}`;
        const cachedProjectId = await this.redis.get(cacheKey);
        if (cachedProjectId) {
            request.projectId = cachedProjectId;
            return true;
        }
        const result = await this.pg.query('SELECT id FROM projects WHERE api_key = $1 LIMIT 1', [apiKey]);
        if (result.rows.length === 0) {
            throw new common_1.UnauthorizedException('x-api-key 无效，请检查 SDK 配置中的 apiKey 是否正确');
        }
        const projectId = result.rows[0].id;
        await this.redis.set(cacheKey, projectId, 'EX', CACHE_TTL_SECONDS);
        request.projectId = projectId;
        return true;
    }
};
exports.ApiKeyGuard = ApiKeyGuard;
exports.ApiKeyGuard = ApiKeyGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_POOL)),
    __param(1, (0, common_1.Inject)(database_module_1.REDIS)),
    __metadata("design:paramtypes", [pg_1.Pool,
        ioredis_1.default])
], ApiKeyGuard);
//# sourceMappingURL=api-key.guard.js.map
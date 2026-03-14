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
exports.DatabaseModule = exports.REDIS = exports.PG_POOL = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const pg_1 = require("pg");
const ioredis_1 = __importDefault(require("ioredis"));
exports.PG_POOL = 'PG_POOL';
exports.REDIS = 'REDIS';
let DatabaseModule = class DatabaseModule {
    constructor(pg, redis) {
        this.pg = pg;
        this.redis = redis;
    }
    async onApplicationShutdown() {
        await this.pg.end();
        this.redis.disconnect();
    }
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: exports.PG_POOL,
                useFactory: (configService) => {
                    const databaseUrl = configService.get('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/omnisight');
                    return new pg_1.Pool({
                        connectionString: databaseUrl,
                        max: 20,
                        idleTimeoutMillis: 30000,
                        connectionTimeoutMillis: 5000,
                    });
                },
                inject: [config_1.ConfigService],
            },
            {
                provide: exports.REDIS,
                useFactory: (configService) => {
                    const redisUrl = configService.get('REDIS_URL', 'redis://localhost:6379');
                    return new ioredis_1.default(redisUrl, {
                        maxRetriesPerRequest: 10,
                        enableOfflineQueue: true,
                    });
                },
                inject: [config_1.ConfigService],
            },
        ],
        exports: [exports.PG_POOL, exports.REDIS],
    }),
    __param(0, (0, common_1.Inject)(exports.PG_POOL)),
    __param(1, (0, common_1.Inject)(exports.REDIS)),
    __metadata("design:paramtypes", [pg_1.Pool,
        ioredis_1.default])
], DatabaseModule);
//# sourceMappingURL=database.module.js.map
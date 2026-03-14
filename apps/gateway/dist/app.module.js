"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bull_1 = require("@nestjs/bull");
const database_module_1 = require("./database.module");
const auth_module_1 = require("./auth/auth.module");
const ingest_module_1 = require("./ingest/ingest.module");
const replay_module_1 = require("./replay/replay.module");
const query_module_1 = require("./query/query.module");
const sourcemap_module_1 = require("./sourcemap/sourcemap.module");
const worker_module_1 = require("./worker/worker.module");
const health_module_1 = require("./health/health.module");
const alert_1 = require("./alert");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            bull_1.BullModule.forRootAsync({
                useFactory: (configService) => {
                    const redisUrl = configService.get('REDIS_URL', 'redis://localhost:6379');
                    const url = new URL(redisUrl);
                    return {
                        redis: {
                            host: url.hostname,
                            port: parseInt(url.port, 10) || 6379,
                        },
                    };
                },
                inject: [config_1.ConfigService],
            }),
            database_module_1.DatabaseModule,
            auth_module_1.AuthModule,
            ingest_module_1.IngestModule,
            replay_module_1.ReplayModule,
            query_module_1.QueryModule,
            sourcemap_module_1.SourcemapModule,
            worker_module_1.WorkerModule,
            health_module_1.HealthModule,
            alert_1.AlertModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
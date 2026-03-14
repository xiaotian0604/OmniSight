"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertModule = exports.ALERT_CHANNELS = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const alert_service_1 = require("./alert.service");
const alert_worker_1 = require("./alert.worker");
const feishu_channel_1 = require("./channels/feishu.channel");
exports.ALERT_CHANNELS = 'ALERT_CHANNELS';
let AlertModule = class AlertModule {
};
exports.AlertModule = AlertModule;
exports.AlertModule = AlertModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
        ],
        providers: [
            alert_service_1.AlertService,
            feishu_channel_1.FeishuChannel,
            {
                provide: exports.ALERT_CHANNELS,
                useFactory: (feishu) => {
                    return [feishu];
                },
                inject: [feishu_channel_1.FeishuChannel],
            },
            alert_worker_1.AlertWorker,
        ],
        exports: [],
    })
], AlertModule);
//# sourceMappingURL=alert.module.js.map
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
var AlertWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertWorker = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const alert_service_1 = require("./alert.service");
const alert_constants_1 = require("./alert.constants");
let AlertWorker = AlertWorker_1 = class AlertWorker {
    constructor(alertService, channels) {
        this.alertService = alertService;
        this.channels = channels;
        this.logger = new common_1.Logger(AlertWorker_1.name);
        this.logger.log('告警 Worker 初始化完成');
    }
    async handleAlertScan() {
        this.logger.log('开始执行定时告警扫描...');
        const startTime = Date.now();
        try {
            const result = await this.alertService.scanAndAlert(this.channels);
            const duration = Date.now() - startTime;
            this.logger.log(`告警扫描完成: 耗时 ${duration}ms, ` +
                `检测到 ${result.scanResult?.errors.length || 0} 个高频错误, ` +
                `发送 ${result.sentCount} 条告警, ` +
                `跳过 ${result.skippedCount} 条`);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`告警扫描执行失败: ${errorMsg}`);
        }
    }
    async triggerManualScan() {
        this.logger.log('手动触发告警扫描');
        const result = await this.alertService.scanAndAlert(this.channels);
        return {
            errors: result.scanResult?.errors.length || 0,
            sent: result.sentCount,
            skipped: result.skippedCount,
        };
    }
};
exports.AlertWorker = AlertWorker;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES, {
        name: 'alert-scan',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AlertWorker.prototype, "handleAlertScan", null);
exports.AlertWorker = AlertWorker = AlertWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(alert_constants_1.ALERT_CHANNELS)),
    __metadata("design:paramtypes", [alert_service_1.AlertService, Array])
], AlertWorker);
//# sourceMappingURL=alert.worker.js.map
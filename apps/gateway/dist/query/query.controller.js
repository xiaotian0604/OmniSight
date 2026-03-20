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
exports.QueryController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const query_service_1 = require("./query.service");
function parsePositiveInt(value, fallback, max) {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.min(parsed, max);
}
function parseNonNegativeInt(value, fallback) {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }
    return parsed;
}
function parseErrorSort(value) {
    return value === 'lastSeen' ? 'lastSeen' : 'count';
}
let QueryController = class QueryController {
    constructor(queryService) {
        this.queryService = queryService;
    }
    async getApps() {
        return this.queryService.getAppsList();
    }
    async getErrors(appId, from, to, limit, offset, sort) {
        return this.queryService.getErrorsGrouped(appId, from, to, parsePositiveInt(limit, 50, 200), parseErrorSort(sort), parseNonNegativeInt(offset, 0));
    }
    async getErrorById(id, appId) {
        return this.queryService.getErrorDetail(id, appId);
    }
    async getErrorRate(appId, from, to, interval) {
        return this.queryService.getErrorRateSeries(appId, from, to, interval || '5 minutes');
    }
    async getApiMetrics(appId, from, to, limit) {
        return this.queryService.getApiMetrics(appId, from, to, parsePositiveInt(limit, 20, 200));
    }
    async getVitals(appId, from, to, name, interval) {
        return this.queryService.getVitalsSeries(appId, from, to, name, interval || '1 hour');
    }
};
exports.QueryController = QueryController;
__decorate([
    (0, common_1.Get)('apps'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 appId 列表',
        description: '返回所有有数据的 appId 列表，包含错误数量和总事件数量。' +
            '用于 console 前端的项目选择器。',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '返回 appId 列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], QueryController.prototype, "getApps", null);
__decorate([
    (0, common_1.Get)('errors'),
    (0, swagger_1.ApiOperation)({
        summary: '错误聚合列表',
        description: '按错误指纹聚合，返回错误消息、发生次数、影响用户数等信息。' +
            '用于 console 的错误列表页。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'appId', description: '项目标识', required: true }),
    (0, swagger_1.ApiQuery)({
        name: 'from',
        description: '起始时间（ISO 8601）',
        required: true,
        example: '2024-01-01T00:00:00Z',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'to',
        description: '结束时间（ISO 8601）',
        required: true,
        example: '2024-01-02T00:00:00Z',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        description: '返回数量限制',
        required: false,
        example: 50,
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '返回错误聚合列表' }),
    __param(0, (0, common_1.Query)('appId')),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __param(3, (0, common_1.Query)('limit')),
    __param(4, (0, common_1.Query)('offset')),
    __param(5, (0, common_1.Query)('sort')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], QueryController.prototype, "getErrors", null);
__decorate([
    (0, common_1.Get)('errors/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '错误详情',
        description: '根据错误指纹获取错误详情；兼容 UUID 形式的事件 ID 查询。',
    }),
    (0, swagger_1.ApiParam)({
        name: 'id',
        description: '错误指纹（推荐）或事件 ID（UUID）',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '返回错误详情' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('appId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], QueryController.prototype, "getErrorById", null);
__decorate([
    (0, common_1.Get)('metrics/error-rate'),
    (0, swagger_1.ApiOperation)({
        summary: '错误率时序趋势',
        description: '按时间桶聚合的错误率数据，用于概览仪表盘的折线图。' +
            '优先使用 TimescaleDB time_bucket，不可用时降级到 date_trunc。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'appId', description: '项目标识', required: true }),
    (0, swagger_1.ApiQuery)({
        name: 'from',
        description: '起始时间（ISO 8601）',
        required: true,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'to',
        description: '结束时间（ISO 8601）',
        required: true,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'interval',
        description: '时间桶间隔（如 5 minutes, 1 hour）',
        required: false,
        example: '5 minutes',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '返回错误率时序数据' }),
    __param(0, (0, common_1.Query)('appId')),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __param(3, (0, common_1.Query)('interval')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], QueryController.prototype, "getErrorRate", null);
__decorate([
    (0, common_1.Get)('metrics/api'),
    (0, swagger_1.ApiOperation)({
        summary: 'API 接口耗时指标',
        description: '各 API 接口的 P50/P99 耗时和请求总数。' +
            '用于性能分析页的接口耗时排行表格。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'appId', description: '项目标识', required: true }),
    (0, swagger_1.ApiQuery)({
        name: 'from',
        description: '起始时间（ISO 8601）',
        required: true,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'to',
        description: '结束时间（ISO 8601）',
        required: true,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        description: '返回数量限制',
        required: false,
        example: 20,
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '返回 API 耗时指标' }),
    __param(0, (0, common_1.Query)('appId')),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], QueryController.prototype, "getApiMetrics", null);
__decorate([
    (0, common_1.Get)('metrics/vitals'),
    (0, swagger_1.ApiOperation)({
        summary: 'Web Vitals 性能指标',
        description: 'LCP/CLS/TTFB/FID/INP 等 Web Vitals 指标的时序数据。' +
            '用于性能分析页的趋势图。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'appId', description: '项目标识', required: true }),
    (0, swagger_1.ApiQuery)({
        name: 'from',
        description: '起始时间（ISO 8601）',
        required: true,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'to',
        description: '结束时间（ISO 8601）',
        required: true,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'name',
        description: '指标名称（LCP/CLS/TTFB/FID/INP）',
        required: false,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'interval',
        description: '时间桶间隔',
        required: false,
        example: '1 hour',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '返回 Vitals 时序数据' }),
    __param(0, (0, common_1.Query)('appId')),
    __param(1, (0, common_1.Query)('from')),
    __param(2, (0, common_1.Query)('to')),
    __param(3, (0, common_1.Query)('name')),
    __param(4, (0, common_1.Query)('interval')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], QueryController.prototype, "getVitals", null);
exports.QueryController = QueryController = __decorate([
    (0, swagger_1.ApiTags)('数据查询'),
    (0, common_1.Controller)('v1'),
    __metadata("design:paramtypes", [query_service_1.QueryService])
], QueryController);
//# sourceMappingURL=query.controller.js.map
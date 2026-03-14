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
exports.IngestController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const api_key_guard_1 = require("../auth/api-key.guard");
const ingest_service_1 = require("./ingest.service");
const ingest_dto_1 = require("./ingest.dto");
let IngestController = class IngestController {
    constructor(ingestService) {
        this.ingestService = ingestService;
    }
    async ingestBatch(events) {
        if (events.length === 0) {
            return { success: true, jobId: null };
        }
        const job = await this.ingestService.enqueue(events);
        return {
            success: true,
            jobId: job.id,
        };
    }
};
exports.IngestController = IngestController;
__decorate([
    (0, common_1.Post)('batch'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    (0, swagger_1.ApiSecurity)('api-key'),
    (0, swagger_1.ApiOperation)({
        summary: 'SDK 批量事件上报',
        description: '接收 SDK 采集的事件数组，写入 Bull Queue 异步处理。' +
            '请求体直接是 JSON 数组格式 [event1, event2, ...]',
    }),
    (0, swagger_1.ApiBody)({
        type: [ingest_dto_1.IngestEventDto],
        description: '事件数组，每个元素需符合 IngestEventDto 的校验规则',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '事件已成功写入处理队列',
        schema: {
            properties: {
                success: { type: 'boolean', example: true },
                jobId: { type: 'string', example: '42' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '请求体格式错误或校验失败' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'x-api-key 缺失或无效' }),
    __param(0, (0, common_1.Body)(new common_1.ParseArrayPipe({
        items: ingest_dto_1.IngestEventDto,
        optional: false,
    }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], IngestController.prototype, "ingestBatch", null);
exports.IngestController = IngestController = __decorate([
    (0, swagger_1.ApiTags)('事件上报'),
    (0, common_1.Controller)('v1/ingest'),
    __metadata("design:paramtypes", [ingest_service_1.IngestService])
], IngestController);
//# sourceMappingURL=ingest.controller.js.map
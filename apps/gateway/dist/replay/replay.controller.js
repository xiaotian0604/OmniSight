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
exports.ReplayController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const replay_service_1 = require("./replay.service");
const replay_dto_1 = require("./replay.dto");
const api_key_guard_1 = require("../auth/api-key.guard");
let ReplayController = class ReplayController {
    constructor(replayService) {
        this.replayService = replayService;
    }
    async uploadReplay(body) {
        await this.replayService.save(body.sessionId, body.appId, body.events, body.errorCount);
        return {
            success: true,
            sessionId: body.sessionId,
        };
    }
    async getReplay(sessionId) {
        return this.replayService.getBySessionId(sessionId);
    }
    async listReplays(appId, limit, offset) {
        return this.replayService.list(appId, limit ? parseInt(limit, 10) : 20, offset ? parseInt(offset, 10) : 0);
    }
};
exports.ReplayController = ReplayController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    (0, swagger_1.ApiSecurity)('api-key'),
    (0, swagger_1.ApiOperation)({
        summary: '上传 rrweb 录像',
        description: 'SDK 在 JS 错误发生后上传用户操作录像。' +
            '录像包含错误前 30 秒和错误后 10 秒的用户操作记录。',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '录像上传成功' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [replay_dto_1.UploadReplayDto]),
    __metadata("design:returntype", Promise)
], ReplayController.prototype, "uploadReplay", null);
__decorate([
    (0, common_1.Get)(':sessionId'),
    (0, swagger_1.ApiOperation)({
        summary: '获取指定会话的录像',
        description: '根据会话 ID 获取完整的 rrweb 事件数据，用于 rrweb-player 回放渲染。',
    }),
    (0, swagger_1.ApiParam)({
        name: 'sessionId',
        description: '用户会话 ID',
        example: 'sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '返回录像数据' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '录像不存在' }),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReplayController.prototype, "getReplay", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: '录像列表',
        description: '获取录像列表（不含 events 详细数据）。支持分页。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'appId', description: '项目标识', required: true }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        description: '每页数量',
        required: false,
        example: 20,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'offset',
        description: '偏移量',
        required: false,
        example: 0,
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '返回录像列表' }),
    __param(0, (0, common_1.Query)('appId')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ReplayController.prototype, "listReplays", null);
exports.ReplayController = ReplayController = __decorate([
    (0, swagger_1.ApiTags)('录像回放'),
    (0, common_1.Controller)('v1/replay'),
    __metadata("design:paramtypes", [replay_service_1.ReplayService])
], ReplayController);
//# sourceMappingURL=replay.controller.js.map
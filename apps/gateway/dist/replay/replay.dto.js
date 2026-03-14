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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadReplayDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class UploadReplayDto {
}
exports.UploadReplayDto = UploadReplayDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '用户会话 ID', example: 'sess_a1b2c3d4' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], UploadReplayDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '项目标识', example: 'my-web-app' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], UploadReplayDto.prototype, "appId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'rrweb 事件数组',
        type: [Object],
    }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], UploadReplayDto.prototype, "events", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '关联错误数量',
        default: 1,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UploadReplayDto.prototype, "errorCount", void 0);
//# sourceMappingURL=replay.dto.js.map
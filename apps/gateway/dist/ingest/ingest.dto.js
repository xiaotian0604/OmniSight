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
exports.IngestEventDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const EVENT_TYPES = [
    'error',
    'api',
    'vital',
    'resource',
    'behavior',
    'whitescreen',
];
class IngestEventDto {
}
exports.IngestEventDto = IngestEventDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '事件类型',
        enum: EVENT_TYPES,
        example: 'error',
    }),
    (0, class_validator_1.IsString)({ message: 'type 必须是字符串' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'type 不能为空' }),
    (0, class_validator_1.IsIn)(EVENT_TYPES, {
        message: `type 必须是以下值之一: ${EVENT_TYPES.join(', ')}`,
    }),
    __metadata("design:type", String)
], IngestEventDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '项目标识（SDK init 时传入的 appId）',
        example: 'my-web-app',
    }),
    (0, class_validator_1.IsString)({ message: 'appId 必须是字符串' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'appId 不能为空' }),
    __metadata("design:type", String)
], IngestEventDto.prototype, "appId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '用户会话 ID（SDK 自动生成的 UUID，存储在 localStorage）',
        example: 'sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    }),
    (0, class_validator_1.IsString)({ message: 'sessionId 必须是字符串' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'sessionId 不能为空' }),
    __metadata("design:type", String)
], IngestEventDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '客户端时间戳（毫秒级 Unix 时间戳，由 SDK 在事件发生时记录）',
        example: 1700000000000,
    }),
    (0, class_validator_1.IsNumber)({}, { message: 'ts 必须是数字（毫秒级时间戳）' }),
    __metadata("design:type", Number)
], IngestEventDto.prototype, "ts", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '事件发生时的页面 URL',
        example: 'https://example.com/dashboard',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)({ message: 'url 必须是字符串' }),
    __metadata("design:type", String)
], IngestEventDto.prototype, "url", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'User-Agent 字符串（浏览器信息）',
        example: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)({ message: 'ua 必须是字符串' }),
    __metadata("design:type", String)
], IngestEventDto.prototype, "ua", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '事件详细数据（JSON 对象）。不同事件类型有不同的字段结构：' +
            'error 类型包含 message/stack/filename/lineno/colno；' +
            'api 类型包含 method/url/status/duration；' +
            'vital 类型包含 name/value/rating',
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], IngestEventDto.prototype, "payload", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '错误去重指纹（仅 error 类型有值）。' +
            '由 SDK 端根据 message + stack 第一帧计算的 hash，用于聚合相同错误',
        example: 'abc123def456',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)({ message: 'fingerprint 必须是字符串' }),
    __metadata("design:type", String)
], IngestEventDto.prototype, "fingerprint", void 0);
//# sourceMappingURL=ingest.dto.js.map
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
exports.UploadSourcemapDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const SAFE_PATH_REGEX = /^[a-zA-Z0-9._-]+$/;
class UploadSourcemapDto {
}
exports.UploadSourcemapDto = UploadSourcemapDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '项目标识', example: 'my-web-app' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Matches)(SAFE_PATH_REGEX, {
        message: 'appId 只能包含字母、数字、连字符、下划线和点号',
    }),
    __metadata("design:type", String)
], UploadSourcemapDto.prototype, "appId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: '应用版本号（git sha 或 tag）',
        example: 'abc123',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Matches)(SAFE_PATH_REGEX, {
        message: 'version 只能包含字母、数字、连字符、下划线和点号',
    }),
    __metadata("design:type", String)
], UploadSourcemapDto.prototype, "version", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '原始 JS 文件名', example: 'main.js' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Matches)(SAFE_PATH_REGEX, {
        message: 'filename 只能包含字母、数字、连字符、下划线和点号',
    }),
    __metadata("design:type", String)
], UploadSourcemapDto.prototype, "filename", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'SourceMap 文件内容（JSON 字符串）',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], UploadSourcemapDto.prototype, "mapContent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Git 提交 hash',
        example: 'abc123def456789',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], UploadSourcemapDto.prototype, "gitCommit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Git 提交作者',
        example: 'zhangsan',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], UploadSourcemapDto.prototype, "gitAuthor", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Git 提交信息',
        example: 'feat: add new feature',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], UploadSourcemapDto.prototype, "gitMessage", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Git 分支名',
        example: 'main',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], UploadSourcemapDto.prototype, "gitBranch", void 0);
//# sourceMappingURL=sourcemap.dto.js.map
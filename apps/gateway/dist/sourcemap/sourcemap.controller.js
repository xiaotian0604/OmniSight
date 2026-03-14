"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourcemapController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const sourcemap_service_1 = require("./sourcemap.service");
const sourcemap_dto_1 = require("./sourcemap.dto");
const api_key_guard_1 = require("../auth/api-key.guard");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'sourcemaps');
let SourcemapController = class SourcemapController {
    constructor(sourcemapService) {
        this.sourcemapService = sourcemapService;
        if (!fs.existsSync(UPLOAD_DIR)) {
            fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        }
    }
    async uploadSourcemap(body) {
        const versionDir = path.join(UPLOAD_DIR, body.appId, body.version);
        if (!fs.existsSync(versionDir)) {
            fs.mkdirSync(versionDir, { recursive: true });
        }
        const mapFilePath = path.join(versionDir, `${body.filename}.map`);
        fs.writeFileSync(mapFilePath, body.mapContent, 'utf-8');
        const record = await this.sourcemapService.upload(body.appId, body.version, body.filename, mapFilePath, {
            gitCommit: body.gitCommit,
            gitAuthor: body.gitAuthor,
            gitMessage: body.gitMessage,
            gitBranch: body.gitBranch,
        });
        return {
            success: true,
            record,
        };
    }
    async getSourcemaps(appId, version) {
        return this.sourcemapService.getByVersion(appId, version);
    }
};
exports.SourcemapController = SourcemapController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(api_key_guard_1.ApiKeyGuard),
    (0, swagger_1.ApiSecurity)('api-key'),
    (0, swagger_1.ApiOperation)({
        summary: '上传 SourceMap',
        description: 'CI 构建后上传 .map 文件。文件存储到服务器，索引写入数据库。' +
            '同一 appId + version + filename 重复上传会覆盖旧文件。',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'SourceMap 上传成功' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [sourcemap_dto_1.UploadSourcemapDto]),
    __metadata("design:returntype", Promise)
], SourcemapController.prototype, "uploadSourcemap", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: '查询 SourceMap 记录',
        description: '查询已上传的 SourceMap 文件记录。可按版本号筛选。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'appId', description: '项目标识', required: true }),
    (0, swagger_1.ApiQuery)({
        name: 'version',
        description: '应用版本号（可选）',
        required: false,
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '返回 SourceMap 记录列表' }),
    __param(0, (0, common_1.Query)('appId')),
    __param(1, (0, common_1.Query)('version')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], SourcemapController.prototype, "getSourcemaps", null);
exports.SourcemapController = SourcemapController = __decorate([
    (0, swagger_1.ApiTags)('SourceMap 管理'),
    (0, common_1.Controller)('v1/sourcemap'),
    __metadata("design:paramtypes", [sourcemap_service_1.SourcemapService])
], SourcemapController);
//# sourceMappingURL=sourcemap.controller.js.map
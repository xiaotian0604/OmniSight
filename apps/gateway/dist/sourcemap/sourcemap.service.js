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
exports.SourcemapService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const database_module_1 = require("../database.module");
let SourcemapService = class SourcemapService {
    constructor(pg) {
        this.pg = pg;
    }
    async upload(appId, version, filename, mapPath, gitInfo) {
        const result = await this.pg.query(`INSERT INTO sourcemaps (app_id, version, filename, map_path, git_commit, git_author, git_message, git_branch)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (app_id, version, filename) DO UPDATE SET
         map_path = $4,
         git_commit = $5,
         git_author = $6,
         git_message = $7,
         git_branch = $8
       RETURNING *`, [
            appId,
            version,
            filename,
            mapPath,
            gitInfo?.gitCommit || null,
            gitInfo?.gitAuthor || null,
            gitInfo?.gitMessage || null,
            gitInfo?.gitBranch || null,
        ]);
        return result.rows[0];
    }
    async getByVersion(appId, version) {
        if (version) {
            const result = await this.pg.query(`SELECT * FROM sourcemaps
         WHERE app_id = $1 AND version = $2
         ORDER BY created_at DESC`, [appId, version]);
            return result.rows;
        }
        const result = await this.pg.query(`SELECT * FROM sourcemaps
       WHERE app_id = $1
       ORDER BY created_at DESC
       LIMIT 100`, [appId]);
        return result.rows;
    }
    async getByFilename(filename) {
        const result = await this.pg.query(`SELECT * FROM sourcemaps
       WHERE filename = $1
       ORDER BY created_at DESC
       LIMIT 1`, [filename]);
        return result.rows[0] || null;
    }
};
exports.SourcemapService = SourcemapService;
exports.SourcemapService = SourcemapService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_POOL)),
    __metadata("design:paramtypes", [pg_1.Pool])
], SourcemapService);
//# sourceMappingURL=sourcemap.service.js.map
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
var SourcemapService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourcemapService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const database_module_1 = require("../database.module");
const fs = __importStar(require("fs"));
const trace_mapping_1 = require("@jridgewell/trace-mapping");
const SOURCE_CONTEXT_RADIUS = 3;
const MAX_TRACE_MAP_CACHE_SIZE = 50;
let SourcemapService = SourcemapService_1 = class SourcemapService {
    constructor(pg) {
        this.pg = pg;
        this.logger = new common_1.Logger(SourcemapService_1.name);
        this.traceMapCache = new Map();
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
    async resolveLocation(params) {
        const artifact = this.normalizeArtifactFilename(params.filename);
        if (!artifact) {
            return null;
        }
        const record = await this.findMatchingRecord(params.appId, artifact, params.release);
        if (!record) {
            return null;
        }
        const resolved = {
            release: record.version,
            artifact: record.filename,
            gitCommit: record.git_commit || undefined,
            gitAuthor: record.git_author || undefined,
            gitMessage: record.git_message || undefined,
            gitBranch: record.git_branch || undefined,
        };
        if (typeof params.lineno !== 'number' ||
            !Number.isFinite(params.lineno) ||
            params.lineno <= 0) {
            return resolved;
        }
        try {
            const original = this.mapCompiledPosition(record, params.lineno, params.colno);
            if (!original) {
                return resolved;
            }
            resolved.originalFile = original.originalFile;
            resolved.originalLine = original.originalLine;
            resolved.originalColumn = original.originalColumn;
            const sourceContent = (0, trace_mapping_1.sourceContentFor)(this.loadTraceMap(record.map_path), original.originalFile);
            if (sourceContent) {
                resolved.sourceContext = this.extractSourceContext(sourceContent, original.originalLine);
            }
        }
        catch (error) {
            this.logger.warn(`SourceMap 解析失败: appId=${params.appId}, release=${params.release || 'n/a'}, artifact=${artifact}, error=${error instanceof Error ? error.message : String(error)}`);
        }
        return resolved;
    }
    async resolveStack(params) {
        if (!params.stack) {
            return [];
        }
        const parsedFrames = this.parseStackFrames(params.stack);
        if (parsedFrames.length === 0) {
            return [];
        }
        const recordCache = new Map();
        const results = [];
        for (const frame of parsedFrames) {
            const artifact = this.normalizeArtifactFilename(frame.compiledFile);
            if (!artifact ||
                typeof frame.compiledLine !== 'number' ||
                !Number.isFinite(frame.compiledLine) ||
                frame.compiledLine <= 0) {
                results.push({
                    raw: frame.raw,
                    functionName: frame.functionName,
                    compiledFile: frame.compiledFile,
                    compiledLine: frame.compiledLine,
                    compiledColumn: frame.compiledColumn,
                    mapped: false,
                });
                continue;
            }
            const cacheKey = `${params.appId}:${params.release || ''}:${artifact}`;
            let recordPromise = recordCache.get(cacheKey);
            if (!recordPromise) {
                recordPromise = this.findMatchingRecord(params.appId, artifact, params.release);
                recordCache.set(cacheKey, recordPromise);
            }
            const record = await recordPromise;
            if (!record) {
                results.push({
                    raw: frame.raw,
                    functionName: frame.functionName,
                    compiledFile: frame.compiledFile,
                    compiledLine: frame.compiledLine,
                    compiledColumn: frame.compiledColumn,
                    artifact,
                    mapped: false,
                });
                continue;
            }
            results.push(this.mapFrameWithRecord(record, frame, artifact));
        }
        return results;
    }
    async findMatchingRecord(appId, artifact, release) {
        if (release) {
            const exact = await this.pg.query(`SELECT *
         FROM sourcemaps
         WHERE app_id = $1
           AND version = $2
           AND filename = $3
         LIMIT 1`, [appId, release, artifact]);
            return exact.rows[0] || null;
        }
        const latest = await this.pg.query(`SELECT *
       FROM sourcemaps
       WHERE app_id = $1
         AND filename = $2
       ORDER BY created_at DESC
       LIMIT 1`, [appId, artifact]);
        return latest.rows[0] || null;
    }
    normalizeArtifactFilename(filename) {
        if (!filename) {
            return null;
        }
        const raw = filename.trim();
        if (!raw) {
            return null;
        }
        let pathname = raw;
        try {
            pathname = new URL(raw).pathname;
        }
        catch {
            pathname = raw;
        }
        const cleanPath = decodeURIComponent(pathname).split('#')[0].split('?')[0];
        const segments = cleanPath.split('/').filter(Boolean);
        return segments[segments.length - 1] || cleanPath || null;
    }
    parseStackFrames(stack) {
        return stack
            .split(/\r?\n/)
            .filter((line) => line.trim().length > 0)
            .map((line) => this.parseStackLine(line));
    }
    parseStackLine(line) {
        const trimmed = line.trim();
        const chromeMatch = trimmed.match(/^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
        if (chromeMatch) {
            return {
                raw: line,
                functionName: chromeMatch[1] || undefined,
                compiledFile: chromeMatch[2],
                compiledLine: parseInt(chromeMatch[3], 10),
                compiledColumn: parseInt(chromeMatch[4], 10),
            };
        }
        const firefoxMatch = trimmed.match(/^(.+?)@(.+?):(\d+):(\d+)$/);
        if (firefoxMatch) {
            return {
                raw: line,
                functionName: firefoxMatch[1] || undefined,
                compiledFile: firefoxMatch[2],
                compiledLine: parseInt(firefoxMatch[3], 10),
                compiledColumn: parseInt(firefoxMatch[4], 10),
            };
        }
        return {
            raw: line,
        };
    }
    loadTraceMap(mapPath) {
        const stat = fs.statSync(mapPath);
        const cached = this.traceMapCache.get(mapPath);
        if (cached && cached.mtimeMs === stat.mtimeMs) {
            return cached.traceMap;
        }
        const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
        const traceMap = new trace_mapping_1.TraceMap(rawMap);
        this.traceMapCache.set(mapPath, {
            mtimeMs: stat.mtimeMs,
            traceMap,
        });
        if (this.traceMapCache.size > MAX_TRACE_MAP_CACHE_SIZE) {
            const firstKey = this.traceMapCache.keys().next().value;
            if (firstKey) {
                this.traceMapCache.delete(firstKey);
            }
        }
        return traceMap;
    }
    mapCompiledPosition(record, line, column) {
        const traceMap = this.loadTraceMap(record.map_path);
        const original = (0, trace_mapping_1.originalPositionFor)(traceMap, {
            line,
            column: typeof column === 'number' && Number.isFinite(column)
                ? Math.max(column - 1, 0)
                : 0,
        });
        if (!original.source || !original.line) {
            return null;
        }
        return {
            originalFile: original.source,
            originalLine: original.line,
            originalColumn: typeof original.column === 'number' ? original.column + 1 : undefined,
        };
    }
    mapFrameWithRecord(record, frame, artifact) {
        const mapped = this.mapCompiledPosition(record, frame.compiledLine, frame.compiledColumn);
        return {
            raw: frame.raw,
            functionName: frame.functionName,
            compiledFile: frame.compiledFile,
            compiledLine: frame.compiledLine,
            compiledColumn: frame.compiledColumn,
            artifact,
            release: record.version,
            originalFile: mapped?.originalFile,
            originalLine: mapped?.originalLine,
            originalColumn: mapped?.originalColumn,
            mapped: !!mapped,
        };
    }
    extractSourceContext(sourceContent, targetLine) {
        const lines = sourceContent.split(/\r?\n/);
        const start = Math.max(targetLine - SOURCE_CONTEXT_RADIUS, 1);
        const end = Math.min(targetLine + SOURCE_CONTEXT_RADIUS, lines.length);
        const context = [];
        for (let line = start; line <= end; line++) {
            context.push({
                lineNumber: line,
                content: lines[line - 1] || '',
                isTarget: line === targetLine,
            });
        }
        return context;
    }
};
exports.SourcemapService = SourcemapService;
exports.SourcemapService = SourcemapService = SourcemapService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_POOL)),
    __metadata("design:paramtypes", [pg_1.Pool])
], SourcemapService);
//# sourceMappingURL=sourcemap.service.js.map
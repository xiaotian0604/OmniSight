/**
 * ===============================================================
 * OmniSight Gateway — SourceMap 管理 Service
 * ===============================================================
 *
 * 职责：
 * 管理 SourceMap 文件的上传记录和查询。
 *
 * SourceMap 的作用：
 * 生产环境的 JS 文件经过压缩混淆，错误堆栈中的行列号对应的是压缩后的代码，
 * 无法直接定位源码位置。SourceMap 文件记录了压缩前后的映射关系，
 * 通过 SourceMap 可以将压缩后的行列号还原为源文件路径和原始行列号。
 *
 * 工作流程：
 * 1. CI 构建阶段：webpack/vite build 生成 .map 文件
 * 2. CI 脚本调用 POST /v1/sourcemap 上传 .map 文件
 *    - 文件存储到服务器文件系统（或对象存储）
 *    - 文件路径和元信息（app_id, version, filename）记录到 sourcemaps 表
 *    - Git 信息（commit、author、message、branch）一并记录
 * 3. 查看错误详情时：
 *    - 后端根据 app_id + version 找到对应的 SourceMap 文件
 *    - 使用 source-map 库还原压缩后的行列号
 *    - 返回源文件路径 + 原始行列号 + 前后 5 行源码上下文
 *    - 返回 Git 提交信息，方便定位问题
 *
 * Git 关联功能：
 * - CI 上传 SourceMap 时携带 git 信息
 * - 告警时展示相关 Git 提交，方便定位问题
 * - 未来可扩展：调用 Git API @ 相关开发者
 *
 * 数据存储：
 * - 文件本体：存储在服务器本地文件系统（uploads/sourcemaps/ 目录）
 * - 索引信息：存储在 PostgreSQL 的 sourcemaps 表
 *   - UNIQUE (app_id, version, filename) 约束确保同一版本同一文件只有一份
 * ===============================================================
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database.module';
import * as fs from 'fs';
import { TraceMap, originalPositionFor, sourceContentFor } from '@jridgewell/trace-mapping';
import {
  MappedStackFrame,
  ResolvedSourceLocation,
  SourceContextLine,
} from './sourcemap.types';

/**
 * Git 信息接口
 * 用于类型安全的参数传递
 */
export interface GitInfo {
  gitCommit?: string;
  gitAuthor?: string;
  gitMessage?: string;
  gitBranch?: string;
}

interface SourcemapRecord {
  app_id: string;
  version: string;
  filename: string;
  map_path: string;
  git_commit?: string | null;
  git_author?: string | null;
  git_message?: string | null;
  git_branch?: string | null;
}

interface CachedTraceMap {
  mtimeMs: number;
  traceMap: TraceMap;
}

interface ParsedStackFrame {
  raw: string;
  functionName?: string;
  compiledFile?: string;
  compiledLine?: number;
  compiledColumn?: number;
}

const SOURCE_CONTEXT_RADIUS = 3;
const MAX_TRACE_MAP_CACHE_SIZE = 50;

@Injectable()
export class SourcemapService {
  private readonly logger = new Logger(SourcemapService.name);
  private readonly traceMapCache = new Map<string, CachedTraceMap>();

  constructor(
    /**
     * 注入 PostgreSQL 连接池
     * 用于操作 sourcemaps 索引表
     */
    @Inject(PG_POOL) private readonly pg: Pool,
  ) {}

  /**
   * 上传 SourceMap — 记录文件路径和 Git 信息到数据库
   *
   * 业务逻辑：
   * 1. 将 SourceMap 文件的存储路径、元信息和 Git 信息写入 sourcemaps 表
   * 2. 使用 ON CONFLICT DO UPDATE 实现 upsert：
   *    - 如果同一 app_id + version + filename 的记录已存在，更新文件路径和 Git 信息
   *    - 这样重复上传不会报错，而是覆盖旧记录
   *
   * 注意：
   * 文件的实际存储（写入文件系统）由 Controller 层处理，
   * Service 层只负责数据库索引的维护。
   * 这样的分层设计使得未来可以方便地切换存储后端（如 S3、OSS）。
   *
   * @param appId - 项目标识
   * @param version - 应用版本号（通常是 git commit sha 或 tag）
   * @param filename - 原始 JS 文件名（如 main.js, vendor.js）
   * @param mapPath - SourceMap 文件在服务器上的存储路径
   * @param gitInfo - Git 信息（可选）
   *
   * @returns 插入/更新后的 sourcemap 记录
   */
  async upload(
    appId: string,
    version: string,
    filename: string,
    mapPath: string,
    gitInfo?: GitInfo,
  ) {
    const result = await this.pg.query(
      `INSERT INTO sourcemaps (app_id, version, filename, map_path, git_commit, git_author, git_message, git_branch)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (app_id, version, filename) DO UPDATE SET
         map_path = $4,
         git_commit = $5,
         git_author = $6,
         git_message = $7,
         git_branch = $8
       RETURNING *`,
      [
        appId,
        version,
        filename,
        mapPath,
        gitInfo?.gitCommit || null,
        gitInfo?.gitAuthor || null,
        gitInfo?.gitMessage || null,
        gitInfo?.gitBranch || null,
      ],
    );

    return result.rows[0];
  }

  /**
   * 根据版本号查询 SourceMap 记录
   *
   * 业务场景：
   * 1. 错误堆栈还原时：根据 app_id + version 找到所有相关的 SourceMap 文件路径，
   *    然后读取文件内容进行行列号映射
   * 2. console 的 SourceMap 管理页：展示已上传的 SourceMap 列表
   *
   * @param appId - 项目标识
   * @param version - 可选，应用版本号。不传则返回该项目的所有 SourceMap 记录
   *
   * @returns SourceMap 记录数组
   *   每个元素包含：id, app_id, version, filename, map_path, git_*, created_at
   */
  async getByVersion(appId: string, version?: string) {
    /**
     * 动态构建查询条件
     * 如果指定了 version，增加版本号过滤
     * 如果未指定，返回该项目的所有 SourceMap（按创建时间倒序）
     */
    if (version) {
      const result = await this.pg.query(
        `SELECT * FROM sourcemaps
         WHERE app_id = $1 AND version = $2
         ORDER BY created_at DESC`,
        [appId, version],
      );
      return result.rows;
    }

    const result = await this.pg.query(
      `SELECT * FROM sourcemaps
       WHERE app_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [appId],
    );
    return result.rows;
  }

  /**
   * 根据文件名查询 SourceMap 记录
   *
   * 业务场景：
   * 告警时根据错误文件名查找对应的 Git 信息。
   *
   * @param filename - 原始 JS 文件名
   * @returns 最新的 SourceMap 记录（包含 Git 信息）
   */
  async getByFilename(filename: string) {
    const result = await this.pg.query(
      `SELECT * FROM sourcemaps
       WHERE filename = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [filename],
    );
    return result.rows[0] || null;
  }

  /**
   * 根据错误事件中的压缩后位置还原源码位置
   *
   * 匹配策略：
   * 1. 优先使用 appId + release + artifact 精确命中 sourcemap
   * 2. 如果 SDK 没传 release，则退化到 appId + artifact 的最新记录
   * 3. 仅在命中对应 sourcemap 后才执行 source map 反查，避免串版本
   *
   * 还原结果中会同时附带：
   * - 命中的 release / artifact
   * - Git 元信息
   * - 原始源码文件、行列号
   * - sourcesContent 中截出的前后文代码片段
   */
  async resolveLocation(params: {
    appId: string;
    release?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
  }): Promise<ResolvedSourceLocation | null> {
    const artifact = this.normalizeArtifactFilename(params.filename);
    if (!artifact) {
      return null;
    }

    const record = await this.findMatchingRecord(
      params.appId,
      artifact,
      params.release,
    );

    if (!record) {
      return null;
    }

    const resolved: ResolvedSourceLocation = {
      release: record.version,
      artifact: record.filename,
      gitCommit: record.git_commit || undefined,
      gitAuthor: record.git_author || undefined,
      gitMessage: record.git_message || undefined,
      gitBranch: record.git_branch || undefined,
    };

    if (
      typeof params.lineno !== 'number' ||
      !Number.isFinite(params.lineno) ||
      params.lineno <= 0
    ) {
      return resolved;
    }

    try {
      const original = this.mapCompiledPosition(
        record,
        params.lineno,
        params.colno,
      );

      if (!original) {
        return resolved;
      }

      resolved.originalFile = original.originalFile;
      resolved.originalLine = original.originalLine;
      resolved.originalColumn = original.originalColumn;

      const sourceContent = sourceContentFor(
        this.loadTraceMap(record.map_path),
        original.originalFile,
      );
      if (sourceContent) {
        resolved.sourceContext = this.extractSourceContext(
          sourceContent,
          original.originalLine,
        );
      }
    } catch (error) {
      this.logger.warn(
        `SourceMap 解析失败: appId=${params.appId}, release=${params.release || 'n/a'}, artifact=${artifact}, error=${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return resolved;
  }

  /**
   * 将整条 stack 解析为结构化帧，并对每一帧尝试做 SourceMap 还原。
   *
   * 设计目标：
   * - 不覆盖原始 stack，前端可以同时看到 raw stack 和映射结果
   * - 仅对可解析的浏览器常见帧做映射，其他帧原样保留
   * - 同一个 artifact 在一次调用中只查一次 sourcemap 记录
   */
  async resolveStack(params: {
    appId: string;
    release?: string;
    stack?: string;
  }): Promise<MappedStackFrame[]> {
    if (!params.stack) {
      return [];
    }

    const parsedFrames = this.parseStackFrames(params.stack);
    if (parsedFrames.length === 0) {
      return [];
    }

    const recordCache = new Map<string, Promise<SourcemapRecord | null>>();
    const results: MappedStackFrame[] = [];

    for (const frame of parsedFrames) {
      const artifact = this.normalizeArtifactFilename(frame.compiledFile);
      if (
        !artifact ||
        typeof frame.compiledLine !== 'number' ||
        !Number.isFinite(frame.compiledLine) ||
        frame.compiledLine <= 0
      ) {
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
        recordPromise = this.findMatchingRecord(
          params.appId,
          artifact,
          params.release,
        );
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

  private async findMatchingRecord(
    appId: string,
    artifact: string,
    release?: string,
  ): Promise<SourcemapRecord | null> {
    if (release) {
      const exact = await this.pg.query<SourcemapRecord>(
        `SELECT *
         FROM sourcemaps
         WHERE app_id = $1
           AND version = $2
           AND filename = $3
         LIMIT 1`,
        [appId, release, artifact],
      );

      return exact.rows[0] || null;
    }

    const latest = await this.pg.query<SourcemapRecord>(
      `SELECT *
       FROM sourcemaps
       WHERE app_id = $1
         AND filename = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [appId, artifact],
    );

    return latest.rows[0] || null;
  }

  private normalizeArtifactFilename(filename?: string): string | null {
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
    } catch {
      pathname = raw;
    }

    const cleanPath = decodeURIComponent(pathname).split('#')[0].split('?')[0];
    const segments = cleanPath.split('/').filter(Boolean);

    return segments[segments.length - 1] || cleanPath || null;
  }

  private parseStackFrames(stack: string): ParsedStackFrame[] {
    return stack
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => this.parseStackLine(line));
  }

  private parseStackLine(line: string): ParsedStackFrame {
    const trimmed = line.trim();

    const chromeMatch = trimmed.match(
      /^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/,
    );
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

  private loadTraceMap(mapPath: string): TraceMap {
    const stat = fs.statSync(mapPath);
    const cached = this.traceMapCache.get(mapPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.traceMap;
    }

    const rawMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
    const traceMap = new TraceMap(rawMap);

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

  private mapCompiledPosition(
    record: SourcemapRecord,
    line: number,
    column?: number,
  ): {
    originalFile: string;
    originalLine: number;
    originalColumn?: number;
  } | null {
    const traceMap = this.loadTraceMap(record.map_path);
    const original = originalPositionFor(traceMap, {
      line,
      column:
        typeof column === 'number' && Number.isFinite(column)
          ? Math.max(column - 1, 0)
          : 0,
    });

    if (!original.source || !original.line) {
      return null;
    }

    return {
      originalFile: original.source,
      originalLine: original.line,
      originalColumn:
        typeof original.column === 'number' ? original.column + 1 : undefined,
    };
  }

  private mapFrameWithRecord(
    record: SourcemapRecord,
    frame: ParsedStackFrame,
    artifact: string,
  ): MappedStackFrame {
    const mapped = this.mapCompiledPosition(
      record,
      frame.compiledLine!,
      frame.compiledColumn,
    );

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

  private extractSourceContext(
    sourceContent: string,
    targetLine: number,
  ): SourceContextLine[] {
    const lines = sourceContent.split(/\r?\n/);
    const start = Math.max(targetLine - SOURCE_CONTEXT_RADIUS, 1);
    const end = Math.min(targetLine + SOURCE_CONTEXT_RADIUS, lines.length);
    const context: SourceContextLine[] = [];

    for (let line = start; line <= end; line++) {
      context.push({
        lineNumber: line,
        content: lines[line - 1] || '',
        isTarget: line === targetLine,
      });
    }

    return context;
  }
}

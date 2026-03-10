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
 * 3. 查看错误详情时：
 *    - 后端根据 app_id + version 找到对应的 SourceMap 文件
 *    - 使用 source-map 库还原压缩后的行列号
 *    - 返回源文件路径 + 原始行列号 + 前后 5 行源码上下文
 *
 * 数据存储：
 * - 文件本体：存储在服务器本地文件系统（uploads/sourcemaps/ 目录）
 * - 索引信息：存储在 PostgreSQL 的 sourcemaps 表
 *   - UNIQUE (app_id, version, filename) 约束确保同一版本同一文件只有一份
 * ===============================================================
 */

import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database.module';

@Injectable()
export class SourcemapService {
  constructor(
    /**
     * 注入 PostgreSQL 连接池
     * 用于操作 sourcemaps 索引表
     */
    @Inject(PG_POOL) private readonly pg: Pool,
  ) {}

  /**
   * 上传 SourceMap — 记录文件路径到数据库
   *
   * 业务逻辑：
   * 1. 将 SourceMap 文件的存储路径和元信息写入 sourcemaps 表
   * 2. 使用 ON CONFLICT DO UPDATE 实现 upsert：
   *    - 如果同一 app_id + version + filename 的记录已存在，更新文件路径
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
   *
   * @returns 插入/更新后的 sourcemap 记录
   */
  async upload(
    appId: string,
    version: string,
    filename: string,
    mapPath: string,
  ) {
    const result = await this.pg.query(
      `INSERT INTO sourcemaps (app_id, version, filename, map_path)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (app_id, version, filename) DO UPDATE SET
         map_path = $4
       RETURNING *`,
      [appId, version, filename, mapPath],
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
   *   每个元素包含：id, app_id, version, filename, map_path, created_at
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
}

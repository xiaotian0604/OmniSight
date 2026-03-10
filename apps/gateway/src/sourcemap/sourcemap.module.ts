/**
 * ===============================================================
 * OmniSight Gateway — SourceMap 管理模块
 * ===============================================================
 *
 * 职责：
 * 封装 SourceMap 相关的 Controller 和 Service。
 *
 * 模块组成：
 * - SourcemapController — 提供 SourceMap 上传和查询接口
 *   - POST /v1/sourcemap — CI 上传 SourceMap 文件
 *   - GET /v1/sourcemap — 查询 SourceMap 记录
 * - SourcemapService — SourceMap 的数据库索引管理
 *
 * 依赖关系：
 * - DatabaseModule（全局模块）— 提供 PG_POOL
 *   SourcemapService 通过 @Inject(PG_POOL) 获取 PostgreSQL 连接池
 *
 * 文件存储：
 * SourceMap 文件存储在本地文件系统 uploads/sourcemaps/ 目录
 * 数据库只存储文件路径索引，不存储文件内容
 * ===============================================================
 */

import { Module } from '@nestjs/common';
import { SourcemapController } from './sourcemap.controller';
import { SourcemapService } from './sourcemap.service';

@Module({
  controllers: [SourcemapController],
  providers: [SourcemapService],
})
export class SourcemapModule {}

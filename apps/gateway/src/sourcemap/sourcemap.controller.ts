/**
 * ===============================================================
 * OmniSight Gateway — SourceMap 管理 Controller
 * ===============================================================
 *
 * 职责：
 * 提供 SourceMap 文件的上传和查询接口。
 *
 * 接口列表：
 * 1. POST /v1/sourcemap — CI 上传 SourceMap 文件
 * 2. GET /v1/sourcemap — 查询 SourceMap 记录
 *
 * SourceMap 上传流程：
 * CI 构建完成后，通过脚本调用此接口上传 .map 文件：
 *   curl -X POST http://gateway:3000/v1/sourcemap \
 *     -H "Content-Type: application/json" \
 *     -d '{ "appId": "my-app", "version": "abc123", "filename": "main.js", "mapContent": "..." }'
 *
 * 当前实现简化说明：
 * - 文件内容直接以 JSON 字段传递（适合小文件）
 * - 生产环境应改为 multipart/form-data 文件上传
 * - 文件存储在本地文件系统 uploads/sourcemaps/ 目录
 * - 未来可扩展为对象存储（S3/OSS）
 * ===============================================================
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { SourcemapService } from './sourcemap.service';
import { UploadSourcemapDto } from './sourcemap.dto';
import { ApiKeyGuard } from '../auth/api-key.guard';
import * as fs from 'fs';
import * as path from 'path';

/**
 * SourceMap 文件存储目录
 * 相对于项目根目录的路径
 * 生产环境应配置为环境变量或使用对象存储
 */
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'sourcemaps');

@ApiTags('SourceMap 管理')
@Controller('v1/sourcemap')
export class SourcemapController {
  constructor(
    /** 注入 SourceMap 管理 Service */
    private readonly sourcemapService: SourcemapService,
  ) {
    /**
     * 确保上传目录存在
     * recursive: true — 如果父目录不存在也会一并创建
     */
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  }

  /**
   * POST /v1/sourcemap — 上传 SourceMap 文件
   *
   * 接口用途：
   * CI 构建完成后调用此接口上传 .map 文件。
   * 上传后，查看错误详情时可以通过 SourceMap 还原压缩后的堆栈，
   * 展示源码上下文，大幅提升错误定位效率。
   *
   * @param body - 请求体
   * @param body.appId - 项目标识
   * @param body.version - 应用版本号（建议使用 git commit sha 或 tag）
   * @param body.filename - 原始 JS 文件名（如 main.js）
   * @param body.mapContent - SourceMap 文件内容（JSON 字符串）
   *
   * @returns {{ success: boolean, record: object }}
   *   - success: 是否上传成功
   *   - record: 数据库中的 sourcemap 记录
   */
  @Post()
  @HttpCode(200)
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: '上传 SourceMap',
    description:
      'CI 构建后上传 .map 文件。文件存储到服务器，索引写入数据库。' +
      '同一 appId + version + filename 重复上传会覆盖旧文件。',
  })
  @ApiResponse({ status: 200, description: 'SourceMap 上传成功' })
  async uploadSourcemap(
    @Body() body: UploadSourcemapDto,
  ) {
    /**
     * 构建文件存储路径
     * 目录结构：uploads/sourcemaps/{appId}/{version}/
     * 文件名：{filename}.map
     *
     * 示例：uploads/sourcemaps/my-app/abc123/main.js.map
     */
    const versionDir = path.join(UPLOAD_DIR, body.appId, body.version);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    const mapFilePath = path.join(versionDir, `${body.filename}.map`);

    /**
     * 将 SourceMap 内容写入文件系统
     * 使用 writeFileSync 确保写入完成后再更新数据库索引
     */
    fs.writeFileSync(mapFilePath, body.mapContent, 'utf-8');

    /**
     * 将文件路径和元信息记录到数据库
     * 如果同一 appId + version + filename 已存在，会更新 map_path
     */
    const record = await this.sourcemapService.upload(
      body.appId,
      body.version,
      body.filename,
      mapFilePath,
    );

    return {
      success: true,
      record,
    };
  }

  /**
   * GET /v1/sourcemap — 查询 SourceMap 记录
   *
   * 接口用途：
   * 1. console 的 SourceMap 管理页：展示已上传的 SourceMap 列表
   * 2. 内部使用：错误堆栈还原时查找对应的 SourceMap 文件路径
   *
   * @param appId - 项目标识（必填）
   * @param version - 应用版本号（可选），不传则返回该项目的所有记录
   *
   * @returns SourceMap 记录数组
   */
  @Get()
  @ApiOperation({
    summary: '查询 SourceMap 记录',
    description:
      '查询已上传的 SourceMap 文件记录。可按版本号筛选。',
  })
  @ApiQuery({ name: 'appId', description: '项目标识', required: true })
  @ApiQuery({
    name: 'version',
    description: '应用版本号（可选）',
    required: false,
  })
  @ApiResponse({ status: 200, description: '返回 SourceMap 记录列表' })
  async getSourcemaps(
    @Query('appId') appId: string,
    @Query('version') version?: string,
  ) {
    return this.sourcemapService.getByVersion(appId, version);
  }
}

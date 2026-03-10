/**
 * ===============================================================
 * OmniSight Gateway — 录像管理 Controller
 * ===============================================================
 *
 * 职责：
 * 提供 rrweb 录像的上传和查询接口。
 *
 * 接口列表：
 * 1. POST /v1/replay — 上传录像数据（SDK 在错误发生后调用）
 * 2. GET /v1/replay/:sessionId — 获取指定会话的录像（回放页面使用）
 * 3. GET /v1/replay — 录像列表（录像列表页使用）
 *
 * 数据流：
 *   SDK (replay.ts) → POST /v1/replay → ReplayService.save() → PostgreSQL
 *   Console (回放页面) → GET /v1/replay/:sessionId → ReplayService → rrweb-player 渲染
 * ===============================================================
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { ReplayService } from './replay.service';
import { UploadReplayDto } from './replay.dto';
import { ApiKeyGuard } from '../auth/api-key.guard';

@ApiTags('录像回放')
@Controller('v1/replay')
export class ReplayController {
  constructor(
    /** 注入录像管理 Service */
    private readonly replayService: ReplayService,
  ) {}

  /**
   * POST /v1/replay — 上传 rrweb 录像数据
   *
   * 接口用途：
   * SDK 的 replay.ts 模块在 JS 错误发生后，将 Ring Buffer 中的 rrweb 事件
   * （前 30 秒 + 后 10 秒）通过此接口上传到服务端存储。
   *
   * @param body - 请求体
   * @param body.sessionId - 用户会话 ID（SDK 生成的 UUID）
   * @param body.appId - 项目标识
   * @param body.events - rrweb 事件数组（包含 DOM 快照、增量变更、鼠标移动等）
   * @param body.errorCount - 本次录像关联的错误数量（默认 1）
   *
   * @returns {{ success: boolean, sessionId: string }}
   *   - success: 是否保存成功
   *   - sessionId: 录像的会话 ID，前端可用此 ID 跳转到回放页面
   */
  @Post()
  @HttpCode(200)
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: '上传 rrweb 录像',
    description:
      'SDK 在 JS 错误发生后上传用户操作录像。' +
      '录像包含错误前 30 秒和错误后 10 秒的用户操作记录。',
  })
  @ApiResponse({ status: 200, description: '录像上传成功' })
  async uploadReplay(
    @Body() body: UploadReplayDto,
  ) {
    await this.replayService.save(
      body.sessionId,
      body.appId,
      body.events,
      body.errorCount,
    );

    return {
      success: true,
      sessionId: body.sessionId,
    };
  }

  /**
   * GET /v1/replay/:sessionId — 获取指定会话的录像数据
   *
   * 接口用途：
   * console 的回放页面通过此接口获取完整的 rrweb 事件数据，
   * 然后传给 rrweb-player 组件进行回放渲染。
   *
   * @param sessionId - 用户会话 ID（URL 路径参数）
   *
   * @returns 录像记录对象
   *   - session_id: 会话 ID
   *   - app_id: 项目标识
   *   - events: rrweb 事件数组（JSONB）
   *   - error_count: 关联错误数量
   *   - duration: 录像时长（毫秒）
   *   - created_at: 创建时间
   *
   * @throws {NotFoundException} 404 — 指定的 sessionId 不存在
   */
  @Get(':sessionId')
  @ApiOperation({
    summary: '获取指定会话的录像',
    description:
      '根据会话 ID 获取完整的 rrweb 事件数据，用于 rrweb-player 回放渲染。',
  })
  @ApiParam({
    name: 'sessionId',
    description: '用户会话 ID',
    example: 'sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({ status: 200, description: '返回录像数据' })
  @ApiResponse({ status: 404, description: '录像不存在' })
  async getReplay(@Param('sessionId') sessionId: string) {
    return this.replayService.getBySessionId(sessionId);
  }

  /**
   * GET /v1/replay — 录像列表
   *
   * 接口用途：
   * console 的录像列表页调用此接口获取录像列表。
   * 列表展示：会话 ID、关联错误数、录像时长、创建时间。
   * 注意：列表接口不返回 events 字段（数据量大），仅返回元信息。
   *
   * @param appId - 项目标识（Query 参数），筛选当前项目的录像
   * @param limit - 每页数量（Query 参数），默认 20
   * @param offset - 偏移量（Query 参数），用于分页
   *
   * @returns 录像元信息数组（不含 events 字段）
   */
  @Get()
  @ApiOperation({
    summary: '录像列表',
    description:
      '获取录像列表（不含 events 详细数据）。支持分页。',
  })
  @ApiQuery({ name: 'appId', description: '项目标识', required: true })
  @ApiQuery({
    name: 'limit',
    description: '每页数量',
    required: false,
    example: 20,
  })
  @ApiQuery({
    name: 'offset',
    description: '偏移量',
    required: false,
    example: 0,
  })
  @ApiResponse({ status: 200, description: '返回录像列表' })
  async listReplays(
    @Query('appId') appId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.replayService.list(
      appId,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }
}

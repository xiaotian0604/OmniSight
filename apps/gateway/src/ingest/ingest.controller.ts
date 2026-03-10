/**
 * ===============================================================
 * OmniSight Gateway — 事件上报 Controller
 * ===============================================================
 *
 * 职责：
 * 提供 POST /v1/ingest/batch 接口，接收 SDK 批量上报的事件数据。
 *
 * 接口说明：
 * - 路径：POST /v1/ingest/batch
 * - 鉴权：需要在 Header 中携带 x-api-key（由 ApiKeyGuard 校验）
 * - 请求体：JSON 数组，每个元素是一个事件对象
 *   [
 *     { type: "error", appId: "xxx", sessionId: "yyy", ts: 1700000000000, ... },
 *     { type: "api", appId: "xxx", sessionId: "yyy", ts: 1700000000001, ... }
 *   ]
 * - 响应：{ success: true, jobId: "xxx" }
 *
 * 处理流程：
 * 1. ApiKeyGuard 校验 x-api-key → 通过后进入 Controller
 * 2. ParseArrayPipe 校验数组中每个元素是否符合 IngestEventDto
 * 3. IngestService.enqueue() 将事件写入 Bull Queue
 * 4. 立即返回 200，不等待事件处理完成
 *
 * 为什么 body 是数组而不是 { events: [...] }？
 * - SDK 的 BatchTransport 直接 JSON.stringify(eventArray) 发送
 * - 减少一层包装，节省传输体积
 * - Beacon API 的 payload 越小越好（浏览器对 Beacon 有大小限制）
 * ===============================================================
 */

import {
  Controller,
  Post,
  Body,
  UseGuards,
  ParseArrayPipe,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { IngestService } from './ingest.service';
import { IngestEventDto } from './ingest.dto';

@ApiTags('事件上报')
@Controller('v1/ingest')
export class IngestController {
  constructor(
    /**
     * 注入事件上报 Service
     * 负责将校验通过的事件写入 Bull Queue
     */
    private readonly ingestService: IngestService,
  ) {}

  /**
   * POST /v1/ingest/batch — SDK 批量事件上报接口
   *
   * 这是整个系统的数据入口，所有 SDK 采集的事件都通过此接口上报。
   *
   * @param events - 事件数组，每个元素已通过 IngestEventDto 校验
   *   ParseArrayPipe 会遍历数组中的每个元素，逐一应用 class-validator 校验规则
   *   如果任何一个元素校验失败，整个请求返回 400
   *
   * @returns {{ success: boolean, jobId: string | number }}
   *   - success: 是否成功写入队列
   *   - jobId: Bull Queue 的 Job ID，可用于追踪处理状态
   *
   * @throws {UnauthorizedException} 401 — x-api-key 缺失或无效
   * @throws {BadRequestException} 400 — 请求体格式不正确或校验失败
   */
  @Post('batch')
  @HttpCode(200)
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'SDK 批量事件上报',
    description:
      '接收 SDK 采集的事件数组，写入 Bull Queue 异步处理。' +
      '请求体直接是 JSON 数组格式 [event1, event2, ...]',
  })
  @ApiBody({
    type: [IngestEventDto],
    description: '事件数组，每个元素需符合 IngestEventDto 的校验规则',
  })
  @ApiResponse({
    status: 200,
    description: '事件已成功写入处理队列',
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
        jobId: { type: 'string', example: '42' },
      },
    },
  })
  @ApiResponse({ status: 400, description: '请求体格式错误或校验失败' })
  @ApiResponse({ status: 401, description: 'x-api-key 缺失或无效' })
  async ingestBatch(
    @Body(
      new ParseArrayPipe({
        items: IngestEventDto,
        /**
         * 允许空数组：SDK 在某些边界情况下可能发送空批次
         * 例如页面卸载时 flush 但队列恰好为空
         */
        optional: false,
      }),
    )
    events: IngestEventDto[],
  ) {
    /**
     * 如果是空数组，直接返回成功，不创建 Job
     * 避免在 Bull Queue 中产生无意义的空 Job
     */
    if (events.length === 0) {
      return { success: true, jobId: null };
    }

    const job = await this.ingestService.enqueue(events);

    return {
      success: true,
      jobId: job.id,
    };
  }
}

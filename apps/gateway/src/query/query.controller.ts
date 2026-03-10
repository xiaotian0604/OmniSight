/**
 * ===============================================================
 * OmniSight Gateway — 数据查询 Controller
 * ===============================================================
 *
 * 职责：
 * 提供 console 前端所需的数据查询接口。
 * 这些接口主要供 apps/console 的 React 前端调用（通过 React Query 定时拉取）。
 *
 * 接口列表：
 * 1. GET /v1/errors — 错误聚合列表（按指纹分组）
 * 2. GET /v1/errors/:id — 错误详情
 * 3. GET /v1/metrics/error-rate — 错误率时序趋势
 * 4. GET /v1/metrics/api — API 接口耗时指标（P50/P99）
 * 5. GET /v1/metrics/vitals — Web Vitals 性能指标时序数据
 *
 * 所有查询接口都需要 appId 和时间范围参数（from/to），
 * 确保查询命中 PostgreSQL 索引，避免全表扫描。
 * ===============================================================
 */

import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { QueryService } from './query.service';

@ApiTags('数据查询')
@Controller('v1')
export class QueryController {
  constructor(
    /** 注入数据查询 Service */
    private readonly queryService: QueryService,
  ) {}

  /**
   * GET /v1/errors — 错误聚合列表
   *
   * 接口用途：
   * console 的错误列表页调用此接口。将相同指纹的错误聚合在一起，
   * 展示错误消息、发生次数、影响用户数、首次/最近出现时间。
   * 前端可以按发生次数排序，快速定位高频错误。
   *
   * @param appId - 项目标识（必填）
   * @param from - 起始时间，ISO 8601 格式（必填）
   * @param to - 结束时间，ISO 8601 格式（必填）
   * @param limit - 返回数量限制，默认 50
   *
   * @returns 错误聚合数组
   *   每个元素包含：fingerprint, message, filename, count, affected_users, last_seen, first_seen
   */
  @Get('errors')
  @ApiOperation({
    summary: '错误聚合列表',
    description:
      '按错误指纹聚合，返回错误消息、发生次数、影响用户数等信息。' +
      '用于 console 的错误列表页。',
  })
  @ApiQuery({ name: 'appId', description: '项目标识', required: true })
  @ApiQuery({
    name: 'from',
    description: '起始时间（ISO 8601）',
    required: true,
    example: '2024-01-01T00:00:00Z',
  })
  @ApiQuery({
    name: 'to',
    description: '结束时间（ISO 8601）',
    required: true,
    example: '2024-01-02T00:00:00Z',
  })
  @ApiQuery({
    name: 'limit',
    description: '返回数量限制',
    required: false,
    example: 50,
  })
  @ApiResponse({ status: 200, description: '返回错误聚合列表' })
  async getErrors(
    @Query('appId') appId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('limit') limit?: string,
  ) {
    return this.queryService.getErrorsGrouped(
      appId,
      from,
      to,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * GET /v1/errors/:id — 错误详情
   *
   * 接口用途：
   * console 的错误详情页调用此接口。展示单个错误事件的完整信息：
   * - 错误消息和完整堆栈（用于 SourceMap 还原）
   * - 发生时的页面 URL、User-Agent
   * - 会话 ID（可跳转到关联的录像回放）
   * - 完整的 payload（包含 filename, lineno, colno 等）
   *
   * @param id - 事件 ID（UUID，来自 events 表的 id 字段）
   *
   * @returns 单个事件的完整记录，如果不存在返回 null
   */
  @Get('errors/:id')
  @ApiOperation({
    summary: '错误详情',
    description:
      '根据事件 ID 获取单个错误的完整信息，包括堆栈、页面 URL、UA 等。',
  })
  @ApiParam({
    name: 'id',
    description: '事件 ID（UUID）',
  })
  @ApiResponse({ status: 200, description: '返回错误详情' })
  async getErrorById(@Param('id') id: string) {
    return this.queryService.getErrorById(id);
  }

  /**
   * GET /v1/metrics/error-rate — 错误率时序趋势
   *
   * 接口用途：
   * console 概览仪表盘的"错误率趋势图"。
   * 返回按时间桶聚合的错误率数据，前端用 ECharts 渲染折线图。
   * 支持时间范围刷选（brush select）联动。
   *
   * @param appId - 项目标识（必填）
   * @param from - 起始时间（必填）
   * @param to - 结束时间（必填）
   * @param interval - 时间桶间隔，默认 '5 minutes'
   *   常用值：'1 minute', '5 minutes', '15 minutes', '1 hour', '1 day'
   *
   * @returns 时序数据数组
   *   每个元素包含：bucket, error_count, total_count, error_rate
   */
  @Get('metrics/error-rate')
  @ApiOperation({
    summary: '错误率时序趋势',
    description:
      '按时间桶聚合的错误率数据，用于概览仪表盘的折线图。' +
      '优先使用 TimescaleDB time_bucket，不可用时降级到 date_trunc。',
  })
  @ApiQuery({ name: 'appId', description: '项目标识', required: true })
  @ApiQuery({
    name: 'from',
    description: '起始时间（ISO 8601）',
    required: true,
  })
  @ApiQuery({
    name: 'to',
    description: '结束时间（ISO 8601）',
    required: true,
  })
  @ApiQuery({
    name: 'interval',
    description: '时间桶间隔（如 5 minutes, 1 hour）',
    required: false,
    example: '5 minutes',
  })
  @ApiResponse({ status: 200, description: '返回错误率时序数据' })
  async getErrorRate(
    @Query('appId') appId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('interval') interval?: string,
  ) {
    return this.queryService.getErrorRateSeries(
      appId,
      from,
      to,
      interval || '5 minutes',
    );
  }

  /**
   * GET /v1/metrics/api — API 接口耗时指标
   *
   * 接口用途：
   * console 的性能分析页"接口耗时排行"表格。
   * 展示各 API 接口的 P50/P99 耗时和请求总数。
   * 帮助开发者快速定位慢接口。
   *
   * @param appId - 项目标识（必填）
   * @param from - 起始时间（必填）
   * @param to - 结束时间（必填）
   * @param limit - 返回数量限制，默认 20
   *
   * @returns API 指标数组
   *   每个元素包含：endpoint, method, p50, p99, count
   */
  @Get('metrics/api')
  @ApiOperation({
    summary: 'API 接口耗时指标',
    description:
      '各 API 接口的 P50/P99 耗时和请求总数。' +
      '用于性能分析页的接口耗时排行表格。',
  })
  @ApiQuery({ name: 'appId', description: '项目标识', required: true })
  @ApiQuery({
    name: 'from',
    description: '起始时间（ISO 8601）',
    required: true,
  })
  @ApiQuery({
    name: 'to',
    description: '结束时间（ISO 8601）',
    required: true,
  })
  @ApiQuery({
    name: 'limit',
    description: '返回数量限制',
    required: false,
    example: 20,
  })
  @ApiResponse({ status: 200, description: '返回 API 耗时指标' })
  async getApiMetrics(
    @Query('appId') appId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('limit') limit?: string,
  ) {
    return this.queryService.getApiMetrics(
      appId,
      from,
      to,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * GET /v1/metrics/vitals — Web Vitals 性能指标时序数据
   *
   * 接口用途：
   * console 的性能分析页"Vitals 趋势图"。
   * 展示 LCP/CLS/TTFB/FID/INP 随时间的变化趋势。
   * 前端可以在同一张 ECharts 图上展示多条指标曲线。
   *
   * 指标说明：
   * - LCP (Largest Contentful Paint) — 最大内容绘制时间，衡量加载性能
   * - CLS (Cumulative Layout Shift) — 累积布局偏移，衡量视觉稳定性
   * - TTFB (Time to First Byte) — 首字节时间，衡量服务端响应速度
   * - FID (First Input Delay) — 首次输入延迟，衡量交互响应性
   * - INP (Interaction to Next Paint) — 交互到下一次绘制，FID 的替代指标
   *
   * @param appId - 项目标识（必填）
   * @param from - 起始时间（必填）
   * @param to - 结束时间（必填）
   * @param name - 指标名称筛选（可选，如 'LCP'），不传则返回所有指标
   * @param interval - 时间桶间隔，默认 '1 hour'
   *
   * @returns Vitals 时序数据数组
   *   每个元素包含：bucket, name, avg_value, sample_count
   */
  @Get('metrics/vitals')
  @ApiOperation({
    summary: 'Web Vitals 性能指标',
    description:
      'LCP/CLS/TTFB/FID/INP 等 Web Vitals 指标的时序数据。' +
      '用于性能分析页的趋势图。',
  })
  @ApiQuery({ name: 'appId', description: '项目标识', required: true })
  @ApiQuery({
    name: 'from',
    description: '起始时间（ISO 8601）',
    required: true,
  })
  @ApiQuery({
    name: 'to',
    description: '结束时间（ISO 8601）',
    required: true,
  })
  @ApiQuery({
    name: 'name',
    description: '指标名称（LCP/CLS/TTFB/FID/INP）',
    required: false,
  })
  @ApiQuery({
    name: 'interval',
    description: '时间桶间隔',
    required: false,
    example: '1 hour',
  })
  @ApiResponse({ status: 200, description: '返回 Vitals 时序数据' })
  async getVitals(
    @Query('appId') appId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('name') name?: string,
    @Query('interval') interval?: string,
  ) {
    return this.queryService.getVitalsSeries(
      appId,
      from,
      to,
      name,
      interval || '1 hour',
    );
  }
}

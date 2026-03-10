/**
 * ===============================================================
 * OmniSight Gateway — 事件上报 DTO（Data Transfer Object）
 * ===============================================================
 *
 * 职责：
 * 定义 SDK 上报事件的数据校验规则。
 * 使用 class-validator 装饰器对请求体进行自动校验，
 * 不合法的数据会被 NestJS 的 ValidationPipe 拦截并返回 400 错误。
 *
 * 重要说明 — SDK 上报格式：
 * SDK 通过 POST /v1/ingest/batch 直接发送 JSON 数组：
 *   [event1, event2, event3, ...]
 *
 * 也就是说，请求体（body）本身就是一个数组，而不是 { events: [...] } 这种包装格式。
 * 这样设计是为了减少 SDK 端的序列化开销和传输体积。
 *
 * Controller 中需要配合 ParseArrayPipe 来校验数组中的每个元素：
 *   @Body(new ParseArrayPipe({ items: IngestEventDto }))
 *
 * 支持的事件类型：
 * - error — JS 错误（同步错误、Promise 未捕获异常、console.error）
 * - api — 接口调用（XHR/Fetch 劫持采集的耗时和状态码）
 * - vital — Web Vitals 性能指标（LCP/CLS/TTFB/FID/INP）
 * - resource — 资源加载耗时（图片/CSS/JS 等）
 * - behavior — 用户行为（点击、路由变化）
 * - whitescreen — 白屏检测结果
 * ===============================================================
 */

import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 允许的事件类型枚举值
 * 与 @omnisight/shared-types 中的 EventType 保持一致
 */
const EVENT_TYPES = [
  'error',
  'api',
  'vital',
  'resource',
  'behavior',
  'whitescreen',
] as const;

/**
 * 单个上报事件的 DTO
 *
 * 每个事件包含公共字段（type, appId, sessionId, ts, url, ua）
 * 和可选的类型特定字段（通过 payload 传递或直接在顶层）
 *
 * 校验规则：
 * - type: 必填，必须是预定义的事件类型之一
 * - appId: 必填，项目标识（对应 projects 表的 api_key 关联项目）
 * - sessionId: 必填，用户会话 ID（SDK 端生成的 UUID）
 * - ts: 必填，客户端时间戳（毫秒级 Unix 时间戳）
 * - url: 可选，事件发生时的页面 URL
 * - ua: 可选，User-Agent 字符串
 * - payload: 可选，事件的详细数据（不同类型有不同结构）
 * - fingerprint: 可选，错误去重指纹（仅 error 类型事件有值）
 */
export class IngestEventDto {
  @ApiProperty({
    description: '事件类型',
    enum: EVENT_TYPES,
    example: 'error',
  })
  @IsString({ message: 'type 必须是字符串' })
  @IsNotEmpty({ message: 'type 不能为空' })
  @IsIn(EVENT_TYPES, {
    message: `type 必须是以下值之一: ${EVENT_TYPES.join(', ')}`,
  })
  type!: string;

  @ApiProperty({
    description: '项目标识（SDK init 时传入的 appId）',
    example: 'my-web-app',
  })
  @IsString({ message: 'appId 必须是字符串' })
  @IsNotEmpty({ message: 'appId 不能为空' })
  appId!: string;

  @ApiProperty({
    description: '用户会话 ID（SDK 自动生成的 UUID，存储在 localStorage）',
    example: 'sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString({ message: 'sessionId 必须是字符串' })
  @IsNotEmpty({ message: 'sessionId 不能为空' })
  sessionId!: string;

  @ApiProperty({
    description: '客户端时间戳（毫秒级 Unix 时间戳，由 SDK 在事件发生时记录）',
    example: 1700000000000,
  })
  @IsNumber({}, { message: 'ts 必须是数字（毫秒级时间戳）' })
  ts!: number;

  @ApiPropertyOptional({
    description: '事件发生时的页面 URL',
    example: 'https://example.com/dashboard',
  })
  @IsOptional()
  @IsString({ message: 'url 必须是字符串' })
  url?: string;

  @ApiPropertyOptional({
    description: 'User-Agent 字符串（浏览器信息）',
    example: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...',
  })
  @IsOptional()
  @IsString({ message: 'ua 必须是字符串' })
  ua?: string;

  @ApiPropertyOptional({
    description:
      '事件详细数据（JSON 对象）。不同事件类型有不同的字段结构：' +
      'error 类型包含 message/stack/filename/lineno/colno；' +
      'api 类型包含 method/url/status/duration；' +
      'vital 类型包含 name/value/rating',
  })
  @IsOptional()
  payload?: Record<string, any>;

  @ApiPropertyOptional({
    description:
      '错误去重指纹（仅 error 类型有值）。' +
      '由 SDK 端根据 message + stack 第一帧计算的 hash，用于聚合相同错误',
    example: 'abc123def456',
  })
  @IsOptional()
  @IsString({ message: 'fingerprint 必须是字符串' })
  fingerprint?: string;
}

/**
 * ===============================================================
 * OmniSight Gateway — 录像上传 DTO（Data Transfer Object）
 * ===============================================================
 *
 * 定义 SDK 上传 rrweb 录像数据的校验规则。
 * 使用 class-validator 装饰器自动校验请求体，
 * 不合法的数据会被 NestJS 的 ValidationPipe 拦截并返回 400 错误。
 * ===============================================================
 */

import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * UploadReplayDto — 录像上传请求体的校验类
 *
 * SDK 的 replay.ts 模块在错误发生后，将 Ring Buffer 中的 rrweb 事件
 * 通过 POST /v1/replay 上传。此 DTO 确保请求体包含必要字段。
 */
export class UploadReplayDto {
  /**
   * 用户会话 ID（SDK 生成的 UUID）
   * 用于关联同一用户会话的录像和事件
   */
  @ApiProperty({ description: '用户会话 ID', example: 'sess_a1b2c3d4' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  /**
   * 项目标识
   * 用于区分不同接入方的录像数据
   */
  @ApiProperty({ description: '项目标识', example: 'my-web-app' })
  @IsString()
  @IsNotEmpty()
  appId: string;

  /**
   * rrweb 事件数组
   * 包含 DOM 快照、增量变更、鼠标移动等录制数据
   */
  @ApiProperty({
    description: 'rrweb 事件数组',
    type: [Object],
  })
  @IsArray()
  events: any[];

  /**
   * 本次录像关联的错误数量（可选，默认 1）
   */
  @ApiPropertyOptional({
    description: '关联错误数量',
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  errorCount?: number;
}

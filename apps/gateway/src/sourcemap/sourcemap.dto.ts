/**
 * ===============================================================
 * OmniSight Gateway — SourceMap 上传 DTO（Data Transfer Object）
 * ===============================================================
 *
 * 定义 CI 上传 SourceMap 文件的校验规则。
 * 使用 class-validator 装饰器自动校验请求体。
 *
 * 安全措施：
 * - appId、version、filename 均做路径安全校验
 * - 禁止包含 .. / \ 等路径穿越字符，防止写入任意目录
 * ===============================================================
 */

import {
  IsString,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 路径安全正则：只允许字母、数字、连字符、下划线、点号
 * 禁止 .. / \ 等路径穿越字符
 */
const SAFE_PATH_REGEX = /^[a-zA-Z0-9._-]+$/;

/**
 * UploadSourcemapDto — SourceMap 上传请求体的校验类
 *
 * CI 构建完成后调用 POST /v1/sourcemap 上传 .map 文件。
 * 此 DTO 确保字段合法且不包含路径穿越攻击字符。
 */
export class UploadSourcemapDto {
  /**
   * 项目标识
   * 必须是安全的路径字符（字母、数字、连字符、下划线、点号）
   */
  @ApiProperty({ description: '项目标识', example: 'my-web-app' })
  @IsString()
  @IsNotEmpty()
  @Matches(SAFE_PATH_REGEX, {
    message: 'appId 只能包含字母、数字、连字符、下划线和点号',
  })
  appId: string;

  /**
   * 应用版本号（建议使用 git commit sha 或 tag）
   * 必须是安全的路径字符
   */
  @ApiProperty({
    description: '应用版本号（git sha 或 tag）',
    example: 'abc123',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(SAFE_PATH_REGEX, {
    message: 'version 只能包含字母、数字、连字符、下划线和点号',
  })
  version: string;

  /**
   * 原始 JS 文件名（如 main.js）
   * 必须是安全的路径字符
   */
  @ApiProperty({ description: '原始 JS 文件名', example: 'main.js' })
  @IsString()
  @IsNotEmpty()
  @Matches(SAFE_PATH_REGEX, {
    message: 'filename 只能包含字母、数字、连字符、下划线和点号',
  })
  filename: string;

  /**
   * SourceMap 文件内容（JSON 字符串）
   */
  @ApiProperty({
    description: 'SourceMap 文件内容（JSON 字符串）',
  })
  @IsString()
  @IsNotEmpty()
  mapContent: string;
}

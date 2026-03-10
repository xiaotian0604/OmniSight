/**
 * ===============================================================
 * OmniSight Gateway — 鉴权模块
 * ===============================================================
 *
 * 职责：
 * 封装 API Key 鉴权相关的 Provider，并导出 ApiKeyGuard 供其他模块使用。
 *
 * 模块结构：
 * - ApiKeyGuard — CanActivate 守卫，校验 x-api-key Header
 *
 * 使用方式：
 * 其他模块只需在 Controller 上添加 @UseGuards(ApiKeyGuard) 即可启用鉴权
 * 无需手动导入 AuthModule，因为 ApiKeyGuard 依赖的 PG_POOL 和 REDIS
 * 已经由全局的 DatabaseModule 提供
 *
 * 注意：
 * 这里没有使用 @Global()，因为不是所有接口都需要鉴权
 * 例如 GET /health 健康检查接口就不需要 api_key
 * ===============================================================
 */

import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

@Module({
  /**
   * 注册 ApiKeyGuard 为模块的 Provider
   * NestJS 的 Guard 也是通过依赖注入系统管理的
   */
  providers: [ApiKeyGuard],

  /**
   * 导出 ApiKeyGuard，使其他模块可以在 @UseGuards() 中引用
   * 如果不导出，其他模块中使用 @UseGuards(ApiKeyGuard) 会因为找不到依赖而报错
   */
  exports: [ApiKeyGuard],
})
export class AuthModule {}

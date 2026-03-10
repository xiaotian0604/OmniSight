/**
 * ===============================================================
 * OmniSight Gateway — 健康检查模块
 * ===============================================================
 *
 * 职责：
 * 封装健康检查相关的 Controller。
 *
 * 模块组成：
 * - HealthController — GET /health 接口
 *   检查 PostgreSQL 和 Redis 的连通性
 *
 * 依赖关系：
 * - DatabaseModule（全局模块）— 提供 PG_POOL 和 REDIS
 *   HealthController 通过 @Inject() 获取数据库和 Redis 客户端
 *
 * 注意：
 * 健康检查接口不需要鉴权，不导入 AuthModule
 * Docker/K8s 的探针需要在没有 API Key 的情况下访问此接口
 * ===============================================================
 */

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}

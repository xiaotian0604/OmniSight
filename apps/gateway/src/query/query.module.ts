/**
 * ===============================================================
 * OmniSight Gateway — 数据查询模块
 * ===============================================================
 *
 * 职责：
 * 封装数据查询相关的 Controller 和 Service。
 *
 * 模块组成：
 * - QueryController — 提供错误、指标、Vitals 查询接口
 *   - GET /v1/errors — 错误聚合列表
 *   - GET /v1/errors/:id — 错误详情
 *   - GET /v1/metrics/error-rate — 错误率时序趋势
 *   - GET /v1/metrics/api — API 接口耗时指标
 *   - GET /v1/metrics/vitals — Web Vitals 时序数据
 * - QueryService — 数据查询业务逻辑（SQL 查询封装）
 *
 * 依赖关系：
 * - DatabaseModule（全局模块）— 提供 PG_POOL
 *   QueryService 通过 @Inject(PG_POOL) 获取 PostgreSQL 连接池
 * ===============================================================
 */

import { Module } from '@nestjs/common';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';

@Module({
  controllers: [QueryController],
  providers: [QueryService],
})
export class QueryModule {}

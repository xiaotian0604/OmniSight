/**
 * ===============================================================
 * OmniSight Gateway — 录像管理模块
 * ===============================================================
 *
 * 职责：
 * 封装 rrweb 录像相关的 Controller 和 Service。
 *
 * 模块组成：
 * - ReplayController — 提供录像上传和查询接口
 *   - POST /v1/replay — 上传录像
 *   - GET /v1/replay/:sessionId — 获取指定录像
 *   - GET /v1/replay — 录像列表
 * - ReplayService — 录像的存储和查询业务逻辑
 *
 * 依赖关系：
 * - DatabaseModule（全局模块）— 提供 PG_POOL
 *   ReplayService 通过 @Inject(PG_POOL) 获取 PostgreSQL 连接池
 * ===============================================================
 */

import { Module } from '@nestjs/common';
import { ReplayController } from './replay.controller';
import { ReplayService } from './replay.service';

@Module({
  controllers: [ReplayController],
  providers: [ReplayService],
})
export class ReplayModule {}

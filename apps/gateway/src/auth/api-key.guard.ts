/**
 * ===============================================================
 * OmniSight Gateway — API Key 鉴权守卫
 * ===============================================================
 *
 * 职责：
 * 校验 SDK 上报请求中的 x-api-key Header，确保只有合法的项目才能上报数据。
 *
 * 鉴权流程：
 * 1. 从请求 Header 中提取 x-api-key
 * 2. 如果 Header 缺失，直接返回 401 Unauthorized
 * 3. 先查 Redis 缓存（key: apikey:{key}），命中则直接通过
 * 4. 缓存未命中，查 PostgreSQL projects 表验证 api_key 是否存在
 * 5. 如果 PG 中存在，将结果缓存到 Redis（TTL 5 分钟），避免频繁查库
 * 6. 如果 PG 中也不存在，返回 401 Unauthorized
 *
 * 设计决策：
 * - 使用 Redis 缓存减少数据库查询压力（SDK 每 5 秒批量上报一次，高频场景）
 * - 缓存 TTL 设为 5 分钟，平衡实时性和性能
 * - 将 project_id 存入 request 对象，供后续 Controller/Service 使用
 *
 * 使用方式：
 *   在 Controller 方法或类上添加 @UseGuards(ApiKeyGuard)
 * ===============================================================
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { PG_POOL, REDIS } from '../database.module';

/**
 * Redis 缓存 key 前缀
 * 完整 key 格式：apikey:{api_key_value}
 * 存储的 value 是对应的 project_id（UUID 字符串）
 */
const CACHE_PREFIX = 'apikey:';

/**
 * 缓存过期时间（秒）
 * 5 分钟 = 300 秒
 * 在此期间内，相同 api_key 的请求不会再查数据库
 */
const CACHE_TTL_SECONDS = 300;

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    /**
     * 注入 PostgreSQL 连接池
     * 用于在 Redis 缓存未命中时查询 projects 表验证 api_key
     */
    @Inject(PG_POOL) private readonly pg: Pool,

    /**
     * 注入 Redis 客户端
     * 用于缓存已验证的 api_key → project_id 映射
     */
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * NestJS Guard 的核心方法
   * 返回 true 表示允许请求通过，返回 false 或抛出异常表示拒绝
   *
   * @param context - NestJS 执行上下文，可以从中获取 HTTP 请求对象
   * @returns {Promise<boolean>} 是否允许请求通过
   * @throws {UnauthorizedException} 当 api_key 缺失或无效时抛出 401 错误
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    /**
     * 步骤 1：从请求 Header 中提取 x-api-key
     * SDK 在上报时会在 Header 中携带此字段：
     *   headers: { 'x-api-key': 'dev-api-key-omnisight' }
     */
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      throw new UnauthorizedException(
        '缺少 x-api-key Header，请在 SDK init 时配置正确的 apiKey',
      );
    }

    /**
     * 步骤 2：查 Redis 缓存
     * 如果之前已经验证过这个 api_key，Redis 中会有对应的 project_id
     * 直接使用缓存结果，跳过数据库查询
     */
    const cacheKey = `${CACHE_PREFIX}${apiKey}`;
    const cachedProjectId = await this.redis.get(cacheKey);

    if (cachedProjectId) {
      /**
       * 缓存命中：将 project_id 挂载到 request 对象上
       * 后续的 Controller/Service 可以通过 request['projectId'] 获取
       * 这样就不需要在每个接口中重复解析 api_key
       */
      (request as any).projectId = cachedProjectId;
      return true;
    }

    /**
     * 步骤 3：缓存未命中，查 PostgreSQL projects 表
     * 使用参数化查询防止 SQL 注入（$1 占位符）
     */
    const result = await this.pg.query(
      'SELECT id FROM projects WHERE api_key = $1 LIMIT 1',
      [apiKey],
    );

    /**
     * 步骤 4：判断查询结果
     * 如果 projects 表中没有匹配的记录，说明 api_key 无效
     */
    if (result.rows.length === 0) {
      throw new UnauthorizedException(
        'x-api-key 无效，请检查 SDK 配置中的 apiKey 是否正确',
      );
    }

    /**
     * 步骤 5：验证通过，将结果缓存到 Redis
     * EX 参数设置过期时间（秒），到期后 Redis 自动删除此 key
     * 下次相同 api_key 的请求会在步骤 2 直接命中缓存
     */
    const projectId = result.rows[0].id;
    await this.redis.set(cacheKey, projectId, 'EX', CACHE_TTL_SECONDS);

    /** 将 project_id 挂载到 request 对象，供后续使用 */
    (request as any).projectId = projectId;

    return true;
  }
}

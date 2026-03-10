/**
 * ===============================================================
 * OmniSight Gateway — 健康检查 Controller
 * ===============================================================
 *
 * 职责：
 * 提供 GET /health 接口，检查 Gateway 服务及其依赖（PostgreSQL、Redis）的连通性。
 *
 * 使用场景：
 * 1. Docker/K8s 健康探针（liveness/readiness probe）
 *    docker-compose 或 K8s 可以定期调用此接口判断服务是否正常
 * 2. 面试演示时验证服务状态
 *    启动服务后访问 http://localhost:3000/health 确认一切正常
 * 3. 监控告警
 *    外部监控系统（如 UptimeRobot）定期检查此接口
 *
 * 检查项目：
 * - PostgreSQL 连通性：执行 SELECT 1 查询
 * - Redis 连通性：执行 PING 命令
 *
 * 响应格式：
 * 正常：{ status: 'ok', postgres: 'connected', redis: 'connected', uptime: 12345 }
 * 异常：{ status: 'error', postgres: 'error: ...', redis: 'connected', uptime: 12345 }
 *
 * 注意：
 * 此接口不需要鉴权（不使用 ApiKeyGuard），
 * 因为健康检查需要在没有 API Key 的情况下也能访问。
 * ===============================================================
 */

import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { PG_POOL, REDIS } from '../database.module';

@ApiTags('健康检查')
@Controller('health')
export class HealthController {
  constructor(
    /**
     * 注入 PostgreSQL 连接池
     * 用于检查数据库连通性
     */
    @Inject(PG_POOL) private readonly pg: Pool,

    /**
     * 注入 Redis 客户端
     * 用于检查 Redis 连通性
     */
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * GET /health — 健康检查接口
   *
   * 接口用途：
   * 检查 Gateway 服务及其依赖的连通性。
   * 分别检查 PostgreSQL 和 Redis 的连接状态，
   * 任何一个依赖不可用都会在响应中体现（但不会返回 5xx 状态码）。
   *
   * 检查逻辑：
   * 1. PostgreSQL：执行 `SELECT 1` 查询
   *    - 成功：返回 'connected'
   *    - 失败：返回错误信息（如 'error: Connection refused'）
   * 2. Redis：执行 `PING` 命令
   *    - 成功（返回 'PONG'）：返回 'connected'
   *    - 失败：返回错误信息
   *
   * @returns 健康检查结果对象
   *   - status: 'ok'（全部正常）或 'error'（有依赖异常）
   *   - postgres: PostgreSQL 连接状态
   *   - redis: Redis 连接状态
   *   - uptime: 进程运行时长（秒），用于判断服务是否刚重启
   */
  @Get()
  @ApiOperation({
    summary: '健康检查',
    description:
      '检查 Gateway 服务及 PostgreSQL、Redis 的连通性。' +
      '用于 Docker/K8s 探针和服务状态验证。不需要鉴权。',
  })
  @ApiResponse({
    status: 200,
    description: '健康检查结果',
    schema: {
      properties: {
        status: { type: 'string', example: 'ok' },
        postgres: { type: 'string', example: 'connected' },
        redis: { type: 'string', example: 'connected' },
        uptime: { type: 'number', example: 12345, description: '进程运行时长（秒）' },
      },
    },
  })
  async check() {
    /**
     * 检查 PostgreSQL 连通性
     * 执行最简单的 SQL 查询 `SELECT 1`
     * 如果连接池中有可用连接且数据库正常，此查询会立即返回
     * 如果连接超时或数据库宕机，会抛出异常
     */
    let pgStatus: string;
    try {
      await this.pg.query('SELECT 1');
      pgStatus = 'connected';
    } catch (err: any) {
      pgStatus = `error: ${err.message}`;
    }

    /**
     * 检查 Redis 连通性
     * 执行 PING 命令，正常情况下 Redis 会返回 'PONG'
     * 如果 Redis 不可用或连接断开，会抛出异常
     */
    let redisStatus: string;
    try {
      const pong = await this.redis.ping();
      redisStatus = pong === 'PONG' ? 'connected' : `unexpected: ${pong}`;
    } catch (err: any) {
      redisStatus = `error: ${err.message}`;
    }

    /**
     * 综合判断整体状态
     * 只有 PostgreSQL 和 Redis 都正常时，status 才是 'ok'
     * 任何一个异常，status 为 'error'
     */
    const isHealthy =
      pgStatus === 'connected' && redisStatus === 'connected';

    return {
      status: isHealthy ? 'ok' : 'error',
      postgres: pgStatus,
      redis: redisStatus,
      /** process.uptime() 返回 Node.js 进程的运行时长（秒） */
      uptime: Math.floor(process.uptime()),
    };
  }
}

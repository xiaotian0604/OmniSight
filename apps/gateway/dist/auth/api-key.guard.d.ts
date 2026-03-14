import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
export declare class ApiKeyGuard implements CanActivate {
    private readonly pg;
    private readonly redis;
    constructor(pg: Pool, redis: Redis);
    canActivate(context: ExecutionContext): Promise<boolean>;
}

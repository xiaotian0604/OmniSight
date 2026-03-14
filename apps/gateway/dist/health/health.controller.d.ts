import { Pool } from 'pg';
import Redis from 'ioredis';
export declare class HealthController {
    private readonly pg;
    private readonly redis;
    constructor(pg: Pool, redis: Redis);
    check(): Promise<{
        status: string;
        postgres: string;
        redis: string;
        uptime: number;
    }>;
}

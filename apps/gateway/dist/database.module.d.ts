import { OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
export declare const PG_POOL = "PG_POOL";
export declare const REDIS = "REDIS";
export declare class DatabaseModule implements OnApplicationShutdown {
    private readonly pg;
    private readonly redis;
    constructor(pg: Pool, redis: Redis);
    onApplicationShutdown(): Promise<void>;
}

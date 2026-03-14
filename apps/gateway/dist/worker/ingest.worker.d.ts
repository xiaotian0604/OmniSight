import { Job } from 'bull';
import { Pool } from 'pg';
import Redis from 'ioredis';
export declare class IngestWorker {
    private readonly pg;
    private readonly redis;
    private readonly logger;
    constructor(pg: Pool, redis: Redis);
    handleIngestJob(job: Job<any[]>): Promise<void>;
    private enrich;
}

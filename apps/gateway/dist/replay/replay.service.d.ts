import { Pool } from 'pg';
export declare class ReplayService {
    private readonly pg;
    constructor(pg: Pool);
    save(sessionId: string, appId: string, events: unknown[], errorCount?: number): Promise<any>;
    getBySessionId(sessionId: string): Promise<any>;
    list(appId: string, limit?: number, offset?: number, from?: string, to?: string): Promise<any[]>;
    private getEventTimestamp;
}

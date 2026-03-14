import { Pool } from 'pg';
export declare class QueryService {
    private readonly pg;
    constructor(pg: Pool);
    getErrorRateSeries(appId: string, from: string, to: string, interval?: string): Promise<any[]>;
    private intervalToTruncPrecision;
    getErrorsGrouped(appId: string, from: string, to: string, limit?: number): Promise<any[]>;
    getErrorById(eventId: string): Promise<any>;
    getApiMetrics(appId: string, from: string, to: string, limit?: number): Promise<any[]>;
    getVitalsSeries(appId: string, from: string, to: string, name?: string, interval?: string): Promise<any[]>;
}

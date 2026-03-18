import { Pool } from 'pg';
type ErrorSortBy = 'count' | 'lastSeen';
export declare class QueryService {
    private readonly pg;
    constructor(pg: Pool);
    getErrorRateSeries(appId: string, from: string, to: string, interval?: string): Promise<any[]>;
    private intervalToTruncPrecision;
    getAppsList(): Promise<any[]>;
    getErrorsGrouped(appId: string, from: string, to: string, limit?: number, sortBy?: ErrorSortBy, offset?: number): Promise<any[]>;
    getErrorDetail(identifier: string, appId?: string): Promise<{
        fingerprint: any;
        message: any;
        stack: any;
        filename: any;
        lineno: any;
        colno: any;
        count: number;
        affectedUsers: number;
        firstSeen: any;
        lastSeen: any;
        breadcrumbs: NonNullable<{
            type: string;
            message: string;
            timestamp: string;
            data: any;
        } | {
            type: string;
            message: any;
            timestamp: string;
            data?: undefined;
        } | null>[];
        replaySessionId: string | undefined;
        tags: {
            gitBranch?: any;
            gitAuthor?: any;
            gitCommit?: any;
            ua?: any;
            url?: any;
            appId: any;
            sessionId: any;
        };
    } | null>;
    private findErrorEvent;
    private getErrorAggregate;
    private getReplaySessionId;
    private getGitInfo;
    private getBreadcrumbs;
    private mapBreadcrumb;
    getApiMetrics(appId: string, from: string, to: string, limit?: number): Promise<any[]>;
    getVitalsSeries(appId: string, from: string, to: string, name?: string, interval?: string): Promise<any[]>;
}
export {};

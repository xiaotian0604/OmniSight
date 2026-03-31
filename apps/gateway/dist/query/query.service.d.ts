import { Pool } from 'pg';
import { SourcemapService } from '../sourcemap/sourcemap.service';
type ErrorSortBy = 'count' | 'lastSeen';
export declare class QueryService {
    private readonly pg;
    private readonly sourcemapService;
    constructor(pg: Pool, sourcemapService: SourcemapService);
    getErrorRateSeries(appId: string, from: string, to: string, interval?: string): Promise<any[]>;
    private intervalToTruncPrecision;
    getAppsList(): Promise<any[]>;
    getErrorsGrouped(appId: string, from: string, to: string, limit?: number, sortBy?: ErrorSortBy, offset?: number): Promise<any[]>;
    getErrorDetail(identifier: string, appId?: string): Promise<{
        fingerprint: any;
        message: string;
        stack: string | undefined;
        rawStack: string | undefined;
        mappedStackFrames: import("../sourcemap/sourcemap.types").MappedStackFrame[];
        filename: string | undefined;
        lineno: number | undefined;
        colno: number | undefined;
        release: string | undefined;
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
        sourceMap: import("../sourcemap/sourcemap.types").ResolvedSourceLocation | null;
        tags: {
            gitBranch?: string | undefined;
            gitAuthor?: string | undefined;
            gitCommit?: string | undefined;
            release?: string | undefined;
            ua?: any;
            url?: any;
            appId: any;
            sessionId: any;
        };
    } | null>;
    private findErrorEvent;
    private getErrorAggregate;
    private getReplaySessionId;
    private getBreadcrumbs;
    private mapBreadcrumb;
    private readStringPayloadField;
    private readNumberPayloadField;
    getApiMetrics(appId: string, from: string, to: string, limit?: number): Promise<any[]>;
    getVitalsSeries(appId: string, from: string, to: string, name?: string, interval?: string): Promise<any[]>;
}
export {};

import { QueryService } from './query.service';
export declare class QueryController {
    private readonly queryService;
    constructor(queryService: QueryService);
    getApps(): Promise<any[]>;
    getErrors(appId: string, from: string, to: string, limit?: string, offset?: string, sort?: string): Promise<any[]>;
    getErrorById(id: string, appId?: string): Promise<{
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
    getErrorRate(appId: string, from: string, to: string, interval?: string): Promise<any[]>;
    getApiMetrics(appId: string, from: string, to: string, limit?: string): Promise<any[]>;
    getVitals(appId: string, from: string, to: string, name?: string, interval?: string): Promise<any[]>;
}

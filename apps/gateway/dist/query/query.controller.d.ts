import { QueryService } from './query.service';
export declare class QueryController {
    private readonly queryService;
    constructor(queryService: QueryService);
    getApps(): Promise<any[]>;
    getErrors(appId: string, from: string, to: string, limit?: string, offset?: string, sort?: string): Promise<any[]>;
    getErrorById(id: string, appId?: string): Promise<{
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
    getErrorRate(appId: string, from: string, to: string, interval?: string): Promise<any[]>;
    getApiMetrics(appId: string, from: string, to: string, limit?: string): Promise<any[]>;
    getVitals(appId: string, from: string, to: string, name?: string, interval?: string): Promise<any[]>;
}

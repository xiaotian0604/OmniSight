import { QueryService } from './query.service';
export declare class QueryController {
    private readonly queryService;
    constructor(queryService: QueryService);
    getErrors(appId: string, from: string, to: string, limit?: string): Promise<any[]>;
    getErrorById(id: string): Promise<any>;
    getErrorRate(appId: string, from: string, to: string, interval?: string): Promise<any[]>;
    getApiMetrics(appId: string, from: string, to: string, limit?: string): Promise<any[]>;
    getVitals(appId: string, from: string, to: string, name?: string, interval?: string): Promise<any[]>;
}

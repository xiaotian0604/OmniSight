import { Pool } from 'pg';
export interface GitInfo {
    gitCommit?: string;
    gitAuthor?: string;
    gitMessage?: string;
    gitBranch?: string;
}
export declare class SourcemapService {
    private readonly pg;
    constructor(pg: Pool);
    upload(appId: string, version: string, filename: string, mapPath: string, gitInfo?: GitInfo): Promise<any>;
    getByVersion(appId: string, version?: string): Promise<any[]>;
    getByFilename(filename: string): Promise<any>;
}

import { Pool } from 'pg';
import { MappedStackFrame, ResolvedSourceLocation } from './sourcemap.types';
export interface GitInfo {
    gitCommit?: string;
    gitAuthor?: string;
    gitMessage?: string;
    gitBranch?: string;
}
export declare class SourcemapService {
    private readonly pg;
    private readonly logger;
    private readonly traceMapCache;
    constructor(pg: Pool);
    upload(appId: string, version: string, filename: string, mapPath: string, gitInfo?: GitInfo): Promise<any>;
    getByVersion(appId: string, version?: string): Promise<any[]>;
    getByFilename(filename: string): Promise<any>;
    resolveLocation(params: {
        appId: string;
        release?: string;
        filename?: string;
        lineno?: number;
        colno?: number;
    }): Promise<ResolvedSourceLocation | null>;
    resolveStack(params: {
        appId: string;
        release?: string;
        stack?: string;
    }): Promise<MappedStackFrame[]>;
    private findMatchingRecord;
    private normalizeArtifactFilename;
    private parseStackFrames;
    private parseStackLine;
    private loadTraceMap;
    private mapCompiledPosition;
    private mapFrameWithRecord;
    private extractSourceContext;
}

export declare class IngestEventDto {
    type: string;
    appId: string;
    sessionId: string;
    ts: number;
    url?: string;
    ua?: string;
    payload?: Record<string, any>;
    fingerprint?: string;
}

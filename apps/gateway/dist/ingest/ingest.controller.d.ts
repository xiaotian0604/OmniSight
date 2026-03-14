import { IngestService } from './ingest.service';
import { IngestEventDto } from './ingest.dto';
export declare class IngestController {
    private readonly ingestService;
    constructor(ingestService: IngestService);
    ingestBatch(events: IngestEventDto[]): Promise<{
        success: boolean;
        jobId: null;
    } | {
        success: boolean;
        jobId: import("bull").JobId;
    }>;
}

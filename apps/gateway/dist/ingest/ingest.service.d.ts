import { Queue } from 'bull';
import { IngestEventDto } from './ingest.dto';
export declare class IngestService {
    private readonly ingestQueue;
    constructor(ingestQueue: Queue);
    enqueue(events: IngestEventDto[]): Promise<import("bull").Job<any>>;
}

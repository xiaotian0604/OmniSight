import { ReplayService } from './replay.service';
import { UploadReplayDto } from './replay.dto';
export declare class ReplayController {
    private readonly replayService;
    constructor(replayService: ReplayService);
    uploadReplay(body: UploadReplayDto): Promise<{
        success: boolean;
        sessionId: string;
    }>;
    getReplay(sessionId: string, appId?: string): Promise<any>;
    listReplays(appId: string, from?: string, to?: string, limit?: string, offset?: string): Promise<any[]>;
}

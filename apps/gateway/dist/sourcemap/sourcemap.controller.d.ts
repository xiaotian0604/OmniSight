import { SourcemapService } from './sourcemap.service';
import { UploadSourcemapDto } from './sourcemap.dto';
export declare class SourcemapController {
    private readonly sourcemapService;
    constructor(sourcemapService: SourcemapService);
    uploadSourcemap(body: UploadSourcemapDto): Promise<{
        success: boolean;
        record: any;
    }>;
    getSourcemaps(appId: string, version?: string): Promise<any[]>;
}

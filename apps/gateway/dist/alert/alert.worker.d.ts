import { AlertService } from './alert.service';
import { AlertChannel } from './channels/channel.interface';
export declare class AlertWorker {
    private readonly alertService;
    private readonly channels;
    private readonly logger;
    constructor(alertService: AlertService, channels: AlertChannel[]);
    handleAlertScan(): Promise<void>;
    triggerManualScan(): Promise<{
        errors: number;
        sent: number;
        skipped: number;
    }>;
}

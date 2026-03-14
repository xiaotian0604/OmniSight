import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { AlertPayload, AlertResult, HighFrequencyErrorScanResult } from './types/alert.types';
import { AlertChannel } from './channels/channel.interface';
export declare class AlertService {
    private readonly pg;
    private readonly redis;
    private readonly configService;
    private readonly logger;
    private readonly ruleConfig;
    private readonly alertEnabled;
    constructor(pg: Pool, redis: Redis, configService: ConfigService);
    scanAndAlert(channels: AlertChannel[]): Promise<{
        scanResult: HighFrequencyErrorScanResult | null;
        sentCount: number;
        skippedCount: number;
    }>;
    scanHighFrequencyErrors(): Promise<HighFrequencyErrorScanResult>;
    private checkCooldown;
    private recordAlertSent;
    private buildAlertPayload;
    private getGitInfoForError;
    private sendToChannels;
    triggerAlert(payload: AlertPayload, channels: AlertChannel[]): Promise<AlertResult[]>;
}

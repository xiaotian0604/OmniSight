import { ConfigService } from '@nestjs/config';
import { AlertPayload, AlertResult, AlertChannelType } from '../types/alert.types';
import { AlertChannel } from './channel.interface';
export declare class FeishuChannel implements AlertChannel {
    private readonly configService;
    private readonly logger;
    private readonly config;
    constructor(configService: ConfigService);
    getType(): AlertChannelType;
    isAvailable(): boolean;
    send(payload: AlertPayload): Promise<AlertResult>;
    private buildMessage;
    private getHeaderColor;
    private generateSignature;
    private formatTimeWindow;
    private escapeMarkdown;
}

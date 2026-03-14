import { InjectionToken } from '@nestjs/common';
import { AlertChannel } from './channels/channel.interface';
export declare const ALERT_CHANNELS: InjectionToken<AlertChannel[]>;
export declare class AlertModule {
}

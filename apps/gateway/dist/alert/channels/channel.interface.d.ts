import { AlertPayload, AlertResult, AlertChannelType, FeishuConfig, DingtalkConfig, EmailConfig } from '../types/alert.types';
export interface AlertChannel {
    send(payload: AlertPayload): Promise<AlertResult>;
    getType(): AlertChannelType;
    isAvailable(): boolean;
}
export interface FeishuMessage {
    msg_type: 'interactive';
    card: FeishuCard;
}
export interface FeishuCard {
    header: FeishuCardHeader;
    elements: FeishuCardElement[];
}
export interface FeishuCardHeader {
    title: FeishuCardText;
    template: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'grey';
}
export interface FeishuCardText {
    tag: 'plain_text' | 'lark_md';
    content: string;
}
export type FeishuCardElement = FeishuCardDiv | FeishuCardMarkdown | FeishuCardAction | FeishuCardNote;
export interface FeishuCardDiv {
    tag: 'div';
    text: FeishuCardText;
}
export interface FeishuCardMarkdown {
    tag: 'markdown';
    content: string;
}
export interface FeishuCardAction {
    tag: 'action';
    actions: FeishuCardButton[];
}
export interface FeishuCardButton {
    tag: 'button';
    text: FeishuCardText;
    url?: string;
    type: 'primary' | 'default' | 'danger';
}
export interface FeishuCardNote {
    tag: 'note';
    elements: FeishuCardText[];
}
export interface DingtalkMessage {
    msgtype: 'text' | 'markdown' | 'link' | 'actionCard';
    text?: {
        content: string;
    };
    markdown?: {
        title: string;
        text: string;
    };
}
export interface EmailMessage {
    subject: string;
    body: string;
    recipients: string[];
}
export type ChannelConfigMap = {
    [AlertChannelType.FEISHU]: FeishuConfig;
    [AlertChannelType.DINGTALK]: DingtalkConfig;
    [AlertChannelType.EMAIL]: EmailConfig;
};

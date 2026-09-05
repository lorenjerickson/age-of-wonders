export interface NotificationMessage {
  deliveryId: string;
  recipient: string;
  subject: string;
  text: string;
}

export interface NotificationResult {
  providerMessageId: string;
  captured?: boolean;
}

export interface NotificationPort {
  send(message: NotificationMessage): Promise<NotificationResult>;
}

export const EMAIL_NOTIFICATION_PORT = Symbol("EMAIL_NOTIFICATION_PORT");
export const SMS_NOTIFICATION_PORT = Symbol("SMS_NOTIFICATION_PORT");

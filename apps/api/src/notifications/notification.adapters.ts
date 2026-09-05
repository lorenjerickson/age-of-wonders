import { ServiceUnavailableException } from "@nestjs/common";
import type {
  NotificationMessage,
  NotificationPort,
  NotificationResult,
} from "./notification.port";

export class CaptureNotificationAdapter implements NotificationPort {
  readonly messages: NotificationMessage[] = [];

  send(message: NotificationMessage): Promise<NotificationResult> {
    this.messages.push(message);
    return Promise.resolve({
      providerMessageId: `captured:${message.deliveryId}`,
      captured: true,
    });
  }
}

export class ResendEmailAdapter implements NotificationPort {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: NotificationMessage): Promise<NotificationResult> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.deliveryId,
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.recipient],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string };
    if (!response.ok || !body.id) {
      throw new ServiceUnavailableException("Email delivery was rejected.");
    }
    return { providerMessageId: body.id };
  }
}

export class TwilioSmsAdapter implements NotificationPort {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  async send(message: NotificationMessage): Promise<NotificationResult> {
    const body = new URLSearchParams({
      To: message.recipient,
      From: this.from,
      Body: message.text,
    });
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": message.deliveryId,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      },
    );
    const result = (await response.json().catch(() => ({}))) as {
      sid?: string;
    };
    if (!response.ok || !result.sid) {
      throw new ServiceUnavailableException("SMS delivery was rejected.");
    }
    return { providerMessageId: result.sid };
  }
}

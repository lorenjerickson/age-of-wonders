import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CaptureNotificationAdapter,
  ResendEmailAdapter,
  TwilioSmsAdapter,
} from "./notification.adapters";
import {
  EMAIL_NOTIFICATION_PORT,
  SMS_NOTIFICATION_PORT,
} from "./notification.port";

@Module({
  providers: [
    {
      provide: EMAIL_NOTIFICATION_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>("EMAIL_PROVIDER", "capture");
        if (provider === "capture") {
          if (config.get<string>("NODE_ENV") === "production") {
            throw new Error(
              "EMAIL_PROVIDER=capture is not allowed in production.",
            );
          }
          return new CaptureNotificationAdapter();
        }
        if (provider !== "resend") {
          throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
        }
        const key = config.get<string>("RESEND_API_KEY");
        const from = config.get<string>("EMAIL_FROM");
        if (!key || !from) {
          throw new Error("RESEND_API_KEY and EMAIL_FROM are required.");
        }
        return new ResendEmailAdapter(key, from);
      },
    },
    {
      provide: SMS_NOTIFICATION_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>("SMS_PROVIDER", "capture");
        if (provider === "capture") {
          if (config.get<string>("NODE_ENV") === "production") {
            throw new Error(
              "SMS_PROVIDER=capture is not allowed in production.",
            );
          }
          return new CaptureNotificationAdapter();
        }
        if (provider !== "twilio") {
          throw new Error(`Unsupported SMS_PROVIDER: ${provider}`);
        }
        const sid = config.get<string>("TWILIO_ACCOUNT_SID");
        const token = config.get<string>("TWILIO_AUTH_TOKEN");
        const from = config.get<string>("TWILIO_FROM_NUMBER");
        if (!sid || !token || !from) {
          throw new Error(
            "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are required.",
          );
        }
        return new TwilioSmsAdapter(sid, token, from);
      },
    },
  ],
  exports: [EMAIL_NOTIFICATION_PORT, SMS_NOTIFICATION_PORT],
})
export class NotificationsModule {}

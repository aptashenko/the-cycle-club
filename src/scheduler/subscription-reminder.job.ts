import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from '../notifications/notification.service';
import { SubscriptionService } from '../subscriptions/subscription.service';

@Injectable()
export class SubscriptionReminderJob {
  private readonly logger = new Logger(SubscriptionReminderJob.name);

  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'Europe/Paris' })
  async sendExpirationReminders() {
    await this.sendReminders(5);
    await this.sendReminders(1);
  }

  private async sendReminders(daysBefore: 5 | 1) {
    const subscriptions =
      await this.subscriptions.findExpiringForReminder(daysBefore);
    let sent = 0;

    for (const subscription of subscriptions) {
      try {
        await this.notifications.notifySubscriptionExpiring(
          subscription,
          daysBefore,
        );
        await this.subscriptions.markExpirationReminderSent(
          subscription,
          daysBefore,
        );
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to send ${daysBefore}-day subscription reminder for ${subscription.id}: ${message}`,
        );
      }
    }

    if (sent > 0) {
      this.logger.log(
        `Sent ${sent} ${daysBefore}-day subscription expiration reminders`,
      );
    }
  }
}

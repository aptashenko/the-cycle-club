import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from '../notifications/notification.service';
import { TelegramApiService } from '../notifications/telegram-api.service';
import { SubscriptionService } from '../subscriptions/subscription.service';

@Injectable()
export class SubscriptionExpirationJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubscriptionExpirationJob.name);
  private warnedMissingGroupChatId = false;
  private isProcessing = false;

  constructor(
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionService,
    private readonly notifications: NotificationService,
    private readonly telegram: TelegramApiService,
  ) {}

  async onApplicationBootstrap() {
    await this.expireSubscriptionsAndRemoveFromGroup();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireSubscriptionsAndRemoveFromGroup() {
    if (this.isProcessing) {
      this.logger.warn('Subscription expiration job is already running');
      return;
    }

    this.isProcessing = true;
    try {
      await this.processExpiredSubscriptions();
    } finally {
      this.isProcessing = false;
    }
  }

  private async processExpiredSubscriptions() {
    const groupChatId = this.config.get<string>('CLOSED_GROUP_CHAT_ID');
    if (!groupChatId) {
      if (!this.warnedMissingGroupChatId) {
        this.logger.warn(
          'CLOSED_GROUP_CHAT_ID is not configured; expired users will not be removed from the closed group',
        );
        this.warnedMissingGroupChatId = true;
      }
      return;
    }

    const subscriptions = await this.subscriptions.findExpiredActive();
    let expired = 0;
    let failed = 0;

    for (const subscription of subscriptions) {
      const response = await this.telegram.removeChatMember(
        groupChatId,
        subscription.user.telegramId,
      );

      if (response.ok || this.isAlreadyOutsideGroup(response.description)) {
        await this.subscriptions.markExpired(subscription);
        await this.notifications.notifySubscriptionExpired(subscription);
        expired += 1;
        continue;
      }

      failed += 1;
      this.logger.warn(
        `Failed to remove expired subscriber ${subscription.user.telegramId} from closed group: ${response.description ?? 'unknown Telegram error'}`,
      );
    }

    if (expired > 0 || failed > 0) {
      this.logger.log(
        `Processed expired subscriptions: expired=${expired}, failed=${failed}`,
      );
    }
  }

  private isAlreadyOutsideGroup(description?: string): boolean {
    const normalized = description?.toLowerCase() ?? '';

    return (
      normalized.includes('user not found') ||
      normalized.includes('user_not_participant') ||
      normalized.includes('participant_id_invalid') ||
      normalized.includes('user_id_invalid')
    );
  }
}

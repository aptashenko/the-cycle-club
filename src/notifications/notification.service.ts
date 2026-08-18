import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminTelegramApiService } from '../admin-bot/admin-telegram-api.service';
import { BotFlowService } from '../bot/bot-flow.service';
import { ProductType } from '../common/enums';
import { InviteLinksService } from '../invite-links/invite-links.service';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Product } from '../products/product.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { SupportRequest } from '../support/support-request.entity';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { TelegramApiService } from './telegram-api.service';

const RESOLVE_SUPPORT_PREFIX = 'support:resolve:';
const MARATHON_PRODUCT_SLUG = 'marathon-4';
const MARATHON_CHANNEL_CHAT_ID = 'MARATHON_CHANNEL_CHAT_ID';
const MARATHON_INVITE_EXPIRES_IN_SECONDS = 'MARATHON_INVITE_EXPIRES_IN_SECONDS';
const ASSISTANT_TELEGRAM_ID = '7522999600';
const ASSISTANT_TELEGRAM_URL = 'https://telegram.me/assistant_nicolaeva';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly telegram: TelegramApiService,
    private readonly adminTelegram: AdminTelegramApiService,
    private readonly flow: BotFlowService,
    private readonly inviteLinks: InviteLinksService,
    private readonly users: UserService,
  ) {}

  async notifyPaymentSuccess(
    paymentAttempt: PaymentAttempt,
    subscription?: Subscription,
  ) {
    const isSubscriptionProduct =
      paymentAttempt.product.type === ProductType.Subscription;

    if (this.isConsultationProduct(paymentAttempt.product)) {
      await this.sendConsultationPaymentSuccess(paymentAttempt);
      await this.sendConsultationPaymentAssistantNotification(paymentAttempt);
    } else {
      await this.sendUserMessage(
        paymentAttempt.user,
        this.flow.getPaymentSuccessMessage(
          {
            productTitle: paymentAttempt.product.title,
            date: this.formatSubscriptionDate(subscription),
          },
          isSubscriptionProduct,
        ),
      );
    }

    if (!isSubscriptionProduct) {
      await this.sendGeneratedAccessLinks(paymentAttempt);
      await this.sendDownloadLinks(paymentAttempt);
    }

    await this.sendAdminMessage(
      [
        '✅ <b>Новая оплата</b>',
        '',
        '<b>Пользователь:</b>',
        this.formatUser(paymentAttempt.user),
        '',
        '<b>ID:</b>',
        paymentAttempt.user.telegramId,
        '',
        '<b>Продукт:</b>',
        paymentAttempt.product.title,
        '',
        '<b>Сумма:</b>',
        `${paymentAttempt.amount} ${paymentAttempt.currency}`,
        '',
        '<b>Дата:</b>',
        paymentAttempt.paidAt?.toISOString() ?? new Date().toISOString(),
        '',
        '<b>Transaction ID:</b>',
        paymentAttempt.providerTransactionId ?? '-',
      ].join('\n'),
    );
  }

  async notifyProductAccessBySubscription(user: User, product: Product) {
    await this.sendProductDownloadLinks(user, product);
  }

  async notifySupportRequest(request: SupportRequest) {
    await this.sendAdminMessage(
      [
        '💬 <b>Новое обращение в поддержку</b>',
        '',
        '<b>Пользователь:</b>',
        this.escape(this.formatUser(request.user)),
        '',
        '<b>ID:</b>',
        this.escape(request.user.telegramId),
        '',
        '<b>Тема:</b>',
        this.escape(request.topic),
        ...(request.message
          ? ['', '<b>Сообщение:</b>', this.escape(request.message)]
          : []),
      ].join('\n'),
      true,
      {
        inline_keyboard: [
          [
            {
              text: '✅ Завершить',
              callback_data: `${RESOLVE_SUPPORT_PREFIX}${request.id}`,
            },
          ],
        ],
      },
    );
  }

  async notifySubscriptionExpiring(
    subscription: Subscription,
    daysBefore: 5 | 1,
  ) {
    const daysText = daysBefore === 1 ? '1 день' : '5 дней';
    const expiresText = subscription.expiresAt
      ? subscription.expiresAt.toLocaleDateString('ru-RU', {
          timeZone: 'Europe/Paris',
        })
      : '-';

    await this.sendUserMessage(
      subscription.user,
      [
        '⏰ <b>Доступ скоро закончится</b>',
        '',
        `Продукт: ${subscription.product.title}`,
        `До окончания: ${daysText}`,
        `Активен до: ${expiresText}`,
        '',
        'Чтобы продлить доступ, оформите оплату заново.',
      ].join('\n'),
      {
        inline_keyboard: [
          [
            {
              text: '💳 Продлить доступ',
              callback_data: `product:${subscription.product.slug}`,
            },
          ],
          [{ text: '🫂 Поддержка', callback_data: 'support:open' }],
        ],
      },
    );
  }

  async notifySubscriptionExpired(subscription: Subscription) {
    await this.sendUserMessage(
      subscription.user,
      [
        '🔒 <b>Доступ к группе закрыт</b>',
        '',
        `Ваша подписка на ${subscription.product.title} закончилась.`,
        'Продлите, пожалуйста, подписку, чтобы снова получить доступ.',
      ].join('\n'),
      {
        inline_keyboard: [
          [
            {
              text: '💳 Продлить подписку',
              callback_data: `product:${subscription.product.slug}`,
            },
          ],
          [{ text: '🫂 Поддержка', callback_data: 'support:open' }],
        ],
      },
    );
  }

  async notifyUserRemovedFromClosedGroup(
    subscription: Subscription,
    wasAlreadyOutsideGroup = false,
  ) {
    await this.sendAdminMessage(
      [
        wasAlreadyOutsideGroup
          ? 'ℹ️ <b>Пользователь уже вне закрытой группы</b>'
          : '🚪 <b>Пользователь удален из закрытой группы</b>',
        '',
        '<b>Пользователь:</b>',
        this.escape(this.formatUser(subscription.user)),
        '',
        '<b>ID:</b>',
        this.escape(subscription.user.telegramId),
        '',
        '<b>Продукт:</b>',
        this.escape(subscription.product.title),
        '',
        '<b>Подписка закончилась:</b>',
        this.escape(this.formatSubscriptionDate(subscription)),
        '',
        '<b>Дата обработки:</b>',
        new Date().toISOString(),
      ].join('\n'),
    );
  }

  private async sendAdminMessage(
    text: string,
    includeManager = false,
    replyMarkup?: Record<string, unknown>,
  ) {
    const recipients = this.getAdminRecipients(includeManager);

    await Promise.all(
      recipients.map((chatId) =>
        this.adminTelegram.sendMessage(chatId, text, replyMarkup),
      ),
    );
  }

  private async sendDownloadLinks(paymentAttempt: PaymentAttempt) {
    await this.sendProductDownloadLinks(
      paymentAttempt.user,
      paymentAttempt.product,
    );
  }

  private async sendGeneratedAccessLinks(paymentAttempt: PaymentAttempt) {
    if (paymentAttempt.product.slug !== MARATHON_PRODUCT_SLUG) {
      return;
    }

    const channelChatId = this.config.get<string>(MARATHON_CHANNEL_CHAT_ID);
    if (!channelChatId) {
      await this.sendAdminMessage(
        [
          '⚠️ <b>Не удалось отправить ссылку марафона</b>',
          '',
          `Не задан <code>${MARATHON_CHANNEL_CHAT_ID}</code>.`,
          '',
          '<b>Пользователь:</b>',
          this.formatUser(paymentAttempt.user),
          '',
          '<b>ID:</b>',
          paymentAttempt.user.telegramId,
        ].join('\n'),
      );
      return;
    }

    try {
      const invite = await this.inviteLinks.createSingleUseInviteLink({
        chatId: channelChatId,
        name: this.buildInviteLinkName(paymentAttempt),
        expireInSeconds: this.getMarathonInviteExpiresInSeconds(),
      });

      await this.sendUserMessage(
        paymentAttempt.user,
        [
          'Доступ к каналу марафона готов ✅',
          '',
          'Ссылка индивидуальная и рассчитана на одно вступление.',
        ].join('\n'),
        {
          inline_keyboard: [
            [
              {
                text: 'Перейти в канал марафона ✅',
                url: invite.inviteLink,
              },
            ],
          ],
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create marathon invite link: ${message}`);
      await this.sendAdminMessage(
        [
          '⚠️ <b>Не удалось создать ссылку марафона</b>',
          '',
          `<b>Ошибка:</b> ${this.escape(message)}`,
          '',
          '<b>Пользователь:</b>',
          this.formatUser(paymentAttempt.user),
          '',
          '<b>ID:</b>',
          paymentAttempt.user.telegramId,
        ].join('\n'),
      );
    }
  }

  private isConsultationProduct(product: Product): boolean {
    return product.slug?.startsWith('consultation-format-') === true;
  }

  private async sendConsultationPaymentSuccess(paymentAttempt: PaymentAttempt) {
    await this.sendUserMessage(
      paymentAttempt.user,
      [
        '✅ <b>Ваша оплата прошла успешно.</b>',
        '',
        `Формат: ${this.escape(paymentAttempt.product.title)}`,
        '',
        'Пожалуйста, ожидайте: с вами свяжется ассистент для уточнения даты консультации.',
        '',
        'Если хотите написать самостоятельно, ссылка на ассистента доступна по кнопке ниже.',
      ].join('\n'),
      {
        inline_keyboard: [
          [
            {
              text: 'Связаться с ассистентом',
              url: ASSISTANT_TELEGRAM_URL,
            },
          ],
        ],
      },
    );
  }

  private async sendConsultationPaymentAssistantNotification(
    paymentAttempt: PaymentAttempt,
  ) {
    await this.telegram.sendMessage(
      ASSISTANT_TELEGRAM_ID,
      [
        '✅ <b>Оплачена консультация</b>',
        '',
        `<b>Пользователь:</b> ${this.escape(
          this.formatConsultationBuyer(paymentAttempt.user),
        )}`,
        `<b>Telegram ID:</b> ${this.escape(paymentAttempt.user.telegramId)}`,
        '',
        `<b>Формат:</b> ${this.escape(paymentAttempt.product.title)}`,
        `<b>Сумма:</b> ${this.escape(
          `${paymentAttempt.amount} ${paymentAttempt.currency}`,
        )}`,
        '',
        'Свяжитесь с пользователем для уточнения даты консультации.',
      ].join('\n'),
    );
  }

  private getMarathonInviteExpiresInSeconds(): number | undefined {
    const raw = this.config.get<string>(MARATHON_INVITE_EXPIRES_IN_SECONDS);
    if (!raw) {
      return undefined;
    }

    const seconds = Number(raw);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
  }

  private buildInviteLinkName(paymentAttempt: PaymentAttempt): string {
    return `${paymentAttempt.product.slug}:${paymentAttempt.id.slice(0, 12)}`;
  }

  private async sendProductDownloadLinks(user: User, product: Product) {
    const downloadFiles = product.downloadFiles ?? [];

    if (downloadFiles.length === 0) {
      return;
    }

    await this.sendUserMessage(
      user,
      this.flow.getDownloadMessage({
        productTitle: product.title,
      }),
      {
        inline_keyboard: downloadFiles.map((file) => [
          {
            text: file.title,
            url: this.buildDownloadUrl(file.url),
          },
        ]),
      },
    );
  }

  private buildDownloadUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    const appUrl = this.config
      .get<string>('APP_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;

    return `${appUrl}${path}`;
  }

  private async sendUserMessage(
    user: User,
    text: string,
    replyMarkup?: Record<string, unknown>,
  ) {
    const response = await this.telegram.sendMessage(
      user.telegramId,
      text,
      replyMarkup,
    );

    if (this.telegram.isBotBlockedByUser(response)) {
      const error = response.description ?? 'bot was blocked by the user';
      await this.users.markBotBlocked(user.telegramId, error);
    }

    return response;
  }

  private getAdminRecipients(includeManager: boolean) {
    const ids = this.config
      .get<string>('ADMIN_TELEGRAM_IDS', '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const legacyAdminId = this.config.get<string>('ADMIN_TELEGRAM_ID');
    if (legacyAdminId) {
      ids.push(legacyAdminId);
    }

    const managerId = this.config.get<string>('MANAGER_TELEGRAM_ID');
    if (includeManager && managerId) {
      ids.push(managerId);
    }

    return [...new Set(ids)];
  }

  private formatUser(user: User) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const username = user.username ? `(@${user.username})` : '';

    return [fullName || 'Без имени', username].filter(Boolean).join(' ');
  }

  private formatConsultationBuyer(user: User) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

    if (user.username) {
      return [fullName, `@${user.username}`].filter(Boolean).join(' ');
    }

    if (fullName) {
      return fullName;
    }

    return user.phoneNumber || 'Без имени';
  }

  private formatSubscriptionDate(subscription?: Subscription) {
    if (!subscription?.expiresAt) {
      return '-';
    }

    return subscription.expiresAt.toLocaleDateString('ru-RU', {
      timeZone: 'Europe/Paris',
    });
  }

  private escape(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}

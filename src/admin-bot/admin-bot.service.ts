import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import {
  BotFlowService,
  PAYMENT_CALLBACK_PREFIX,
} from '../bot/bot-flow.service';
import { TelegramMessage, TelegramUpdate } from '../bot/telegram.types';
import {
  PaymentAttemptStatus,
  SubscriptionStatus,
  SupportRequestStatus,
} from '../common/enums';
import { InviteLinksService } from '../invite-links/invite-links.service';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Product } from '../products/product.entity';
import { TelegramApiService } from '../notifications/telegram-api.service';
import { Subscription } from '../subscriptions/subscription.entity';
import { SupportRequest } from '../support/support-request.entity';
import { UserActivityEvent } from '../user-activity/user-activity-event.entity';
import { User } from '../users/user.entity';
import { AdminTelegramApiService } from './admin-telegram-api.service';
import { BroadcastCampaign } from './broadcast-campaign.entity';
import { BroadcastDelivery } from './broadcast-delivery.entity';
import { BroadcastMediaAsset } from './broadcast-media-asset.entity';

const RESOLVE_SUPPORT_PREFIX = 'support:resolve:';
const REPLY_SUPPORT_PREFIX = 'support:reply:';
const ADMIN_MENU_PREFIX = 'admin:menu:';
const GRANT_SUBSCRIPTION_PRODUCT_SLUG = 'the-cycle';
const MARATHON_BROADCAST_SCREEN_ID = 'marathon';
const MARATHON_BROADCAST_PRODUCT_SLUG = 'marathon-4';
const MARATHON_PRODUCT_SLUG_PREFIX = 'marathon-';
const MARATHON_FLOW_ACTION_PREFIX = 'marathon:';
const MARATHON_CHANNEL_CHAT_ID = 'MARATHON_CHANNEL_CHAT_ID';
const MARATHON_INVITE_EXPIRES_IN_SECONDS = 'MARATHON_INVITE_EXPIRES_IN_SECONDS';
const CLOSED_GROUP_CHAT_ID = 'CLOSED_GROUP_CHAT_ID';
const BROADCAST_BATCH_SIZE = 100;
const BROADCAST_SEND_DELAY_MS = 50;
const BROADCAST_CONFIRM_BUTTON = '✅ Подтвердить рассылку';
const BROADCAST_CANCEL_BUTTON = '❌ Отмена';
const BROADCAST_SKIP_BUTTON = 'Без кнопки';
const BROADCAST_SKIP_MEDIA_BUTTON = 'Без медиа';
const BROADCAST_VIDEO_NOTE_BUTTON = '🎥 Кружочек';
const BROADCAST_PHOTO_BUTTON = '🖼 Фото';
const MARATHON_DEFAULT_TEXT_BUTTON = 'Стандартный текст';
const MARATHON_DEFAULT_BUTTON_TEXT_BUTTON = 'Стандартная кнопка';
const PAYMENT_BROADCAST_DEFAULT_BUTTON_TEXT_BUTTON = 'Стандартная кнопка оплаты';
const ADMIN_MENU_BUTTON = '☰ Меню';
const ADMIN_STATS_BUTTON = '📊 Статистика';
const ADMIN_MARATHON_MENU_BUTTON = '🏁 Марафон';
const ADMIN_USERS_MENU_BUTTON = '👥 Пользователи';
const ADMIN_COMMUNICATION_MENU_BUTTON = '💬 Коммуникации';
const ADMIN_GRANT_SUBSCRIPTION_BUTTON = '➕ Выдать подписку';
const ADMIN_MARATHON_4_BUTTON = '🥑 Марафон №4';
const ADMIN_MARATHON_BROADCAST_BUTTON = '📣 Рассылка марафона №4';
const ADMIN_ALL_MARATHONS_BUTTON = '🏁 Все марафоны';
const ADMIN_SINGLE_USE_INVITE_BUTTON = '🔗 Получить разовую инвайт-ссылку';
const ADMIN_BACK_BUTTON = '← Назад';
const ADMIN_USER_BUTTON = '👤 Пользователь';
const ADMIN_PAYMENTS_BUTTON = '💳 Платежи';
const ADMIN_SUBSCRIPTIONS_BUTTON = '🎟 Подписки';
const ADMIN_ACTIVITY_BUTTON = '🧭 Активность';
const ADMIN_SUPPORT_BUTTON = '💬 Поддержка';
const ADMIN_BROADCAST_BUTTON = '📣 Рассылка';
const ADMIN_PAYMENT_BROADCAST_BUTTON = '💳 Рассылка с оплатой';

type GrantSubscriptionSession =
  | {
      step: 'username';
    }
  | {
      step: 'expiresAt';
      username: string;
    };

type BroadcastSession =
  | {
      step: 'message';
    }
  | {
      step: 'marathonMessage';
    }
  | {
      step: 'marathonButtonText';
      text: string;
    }
  | {
      step: 'paymentProductChoice';
    }
  | {
      step: 'paymentMessage';
      productSlug: string;
    }
  | {
      step: 'paymentMediaChoice';
      productSlug: string;
      text: string;
    }
  | {
      step: 'paymentVideoNoteKey' | 'paymentPhotoKey';
      productSlug: string;
      text: string;
    }
  | {
      step: 'paymentButtonText';
      productSlug: string;
      text: string;
      media?: BroadcastMedia;
    }
  | {
      step: 'buttonText';
      text: string;
    }
  | {
      step: 'buttonUrl';
      text: string;
      buttonText: string;
    }
  | {
      step: 'mediaChoice';
      text: string;
      button?: BroadcastButton;
    }
  | {
      step: 'videoNoteKey';
      text: string;
      button?: BroadcastButton;
    }
  | {
      step: 'photoKey';
      text: string;
      button?: BroadcastButton;
    }
  | {
      step: 'confirm';
      text: string;
      recipientsCount: number;
      button?: BroadcastButton;
      media?: BroadcastMedia;
    };

type UrlBroadcastButton = {
  text: string;
  url: string;
  callbackData?: never;
};

type CallbackBroadcastButton = {
  text: string;
  callbackData: string;
  url?: never;
};

type BroadcastButton = UrlBroadcastButton | CallbackBroadcastButton;

type BroadcastMedia = {
  type: 'video_note' | 'photo';
  assetId: string;
  key: string;
};

type SaveMediaAssetSession = {
  type: 'video_note' | 'photo';
  key: string;
};

type SupportReplySession = {
  requestId: string;
};

type InviteDeliveryResult =
  | {
      status: 'sent';
      inviteLink: string;
    }
  | {
      status: 'skipped';
      reason: string;
    }
  | {
      status: 'failed';
      reason: string;
    };

type AdminMenuContext =
  | {
      section: 'main' | 'marathonList' | 'users' | 'communication';
    }
  | {
      section: 'marathonFlow';
      productSlug: string;
    };

@Injectable()
export class AdminBotService {
  private readonly adminIds: Set<string>;
  private readonly grantSubscriptionSessions = new Map<
    string,
    GrantSubscriptionSession
  >();
  private readonly broadcastSessions = new Map<string, BroadcastSession>();
  private readonly saveMediaAssetSessions = new Map<
    string,
    SaveMediaAssetSession
  >();
  private readonly supportReplySessions = new Map<
    string,
    SupportReplySession
  >();
  private readonly adminMenuContexts = new Map<string, AdminMenuContext>();
  private broadcastInProgress = false;

  constructor(
    private readonly telegram: AdminTelegramApiService,
    private readonly mainTelegram: TelegramApiService,
    private readonly flow: BotFlowService,
    private readonly inviteLinks: InviteLinksService,
    private readonly config: ConfigService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(PaymentAttempt)
    private readonly payments: Repository<PaymentAttempt>,
    @InjectRepository(SupportRequest)
    private readonly supportRequests: Repository<SupportRequest>,
    @InjectRepository(UserActivityEvent)
    private readonly activity: Repository<UserActivityEvent>,
    @InjectRepository(BroadcastMediaAsset)
    private readonly broadcastMediaAssets: Repository<BroadcastMediaAsset>,
    @InjectRepository(BroadcastCampaign)
    private readonly broadcastCampaigns: Repository<BroadcastCampaign>,
    @InjectRepository(BroadcastDelivery)
    private readonly broadcastDeliveries: Repository<BroadcastDelivery>,
  ) {
    const ids = [
      ...this.config.get<string>('ADMIN_TELEGRAM_IDS', '').split(','),
      this.config.get<string>('ADMIN_TELEGRAM_ID', ''),
    ]
      .map((id) => id.trim())
      .filter(Boolean);

    this.adminIds = new Set(ids);
  }

  async handleUpdate(update: TelegramUpdate) {
    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
      return;
    }

    if (!update.message?.from) {
      return;
    }

    const message = update.message;
    const from = message.from;
    if (!from || !this.isAdmin(from.id)) {
      await this.telegram.sendMessage(message.chat.id, 'Access denied.');
      return;
    }

    if (!message.text && !message.video_note && !message.photo?.length) {
      return;
    }

    await this.handleMessage(message);
  }

  private async handleCallback(
    callbackQuery: TelegramUpdate['callback_query'],
  ) {
    if (!callbackQuery) {
      return;
    }

    const chatId = callbackQuery.message?.chat.id ?? callbackQuery.from.id;

    if (!this.isAdmin(callbackQuery.from.id)) {
      await this.telegram.answerCallbackQuery(
        callbackQuery.id,
        'Access denied.',
      );
      return;
    }

    const data = callbackQuery.data;
    if (!data) {
      await this.telegram.answerCallbackQuery(callbackQuery.id);
      return;
    }

    if (data.startsWith(RESOLVE_SUPPORT_PREFIX)) {
      await this.telegram.answerCallbackQuery(callbackQuery.id, 'Resolving...');
      await this.resolveSupport(
        chatId,
        data.slice(RESOLVE_SUPPORT_PREFIX.length),
        callbackQuery.message?.message_id,
      );
      return;
    }

    if (data.startsWith(REPLY_SUPPORT_PREFIX)) {
      await this.telegram.answerCallbackQuery(callbackQuery.id);
      await this.startSupportReply(
        chatId,
        data.slice(REPLY_SUPPORT_PREFIX.length),
      );
      return;
    }

    if (data.startsWith(ADMIN_MENU_PREFIX)) {
      await this.telegram.answerCallbackQuery(callbackQuery.id);
      await this.handleMenuAction(chatId, data.slice(ADMIN_MENU_PREFIX.length));
      return;
    }

    await this.telegram.answerCallbackQuery(callbackQuery.id);
  }

  private async handleMessage(message: TelegramMessage) {
    const text = message.text?.trim() ?? '';
    const [command, ...args] = text.split(/\s+/);
    const chatId = message.chat.id;

    const saveMediaAssetSession = this.saveMediaAssetSessions.get(
      String(chatId),
    );
    if (saveMediaAssetSession) {
      if (command === '/cancel') {
        this.saveMediaAssetSessions.delete(String(chatId));
        await this.telegram.sendMessage(chatId, 'Media save cancelled.');
        return;
      }

      await this.handleSaveMediaAssetStep(message, saveMediaAssetSession);
      return;
    }

    const supportReplySession = this.supportReplySessions.get(String(chatId));
    if (supportReplySession) {
      if (command === '/cancel') {
        this.supportReplySessions.delete(String(chatId));
        await this.telegram.sendMessage(chatId, 'Support reply cancelled.');
        return;
      }

      await this.handleSupportReplyStep(chatId, text, supportReplySession);
      return;
    }

    const grantSession = this.grantSubscriptionSessions.get(String(chatId));
    if (grantSession) {
      if (command === '/cancel') {
        this.grantSubscriptionSessions.delete(String(chatId));
        await this.telegram.sendMessage(
          chatId,
          'Subscription grant cancelled.',
        );
        return;
      }

      await this.handleGrantSubscriptionStep(chatId, text, grantSession);
      return;
    }

    const broadcastSession = this.broadcastSessions.get(String(chatId));
    if (broadcastSession) {
      if (command === '/cancel' || text === BROADCAST_CANCEL_BUTTON) {
        this.broadcastSessions.delete(String(chatId));
        await this.telegram.sendMessage(
          chatId,
          'Broadcast cancelled.',
          this.getRemoveKeyboardMarkup(),
        );
        return;
      }

      await this.handleBroadcastStep(
        chatId,
        text,
        command,
        message,
        broadcastSession,
      );
      return;
    }

    if (command === '/start' || command === '/help' || command === '/menu') {
      await this.sendHelp(chatId);
      return;
    }

    if (await this.handleMenuButton(chatId, text)) {
      return;
    }

    if (command === '/stats') {
      await this.sendStats(chatId);
      return;
    }

    if (command === '/support') {
      await this.sendSupport(chatId);
      return;
    }

    if (command === '/marathons') {
      await this.sendMarathonFlows(chatId);
      return;
    }

    if (command === '/resolve_support') {
      await this.resolveSupport(chatId, args[0]);
      return;
    }

    if (command === '/reply_support') {
      await this.replySupport(chatId, args[0], args.slice(1).join(' '));
      return;
    }

    if (command === '/user') {
      await this.sendUser(chatId, args[0]);
      return;
    }

    if (command === '/payments') {
      await this.sendPayments(chatId, args[0]);
      return;
    }

    if (command === '/subscriptions') {
      await this.sendSubscriptions(chatId, args[0]);
      return;
    }

    if (command === '/grant_subscription') {
      await this.startGrantSubscription(chatId);
      return;
    }

    if (command === '/broadcast') {
      await this.startBroadcast(chatId);
      return;
    }

    if (command === '/broadcast_payment') {
      await this.startPaymentBroadcast(chatId);
      return;
    }

    if (command === '/broadcasts') {
      await this.sendBroadcasts(chatId);
      return;
    }

    if (command === '/delete_broadcast') {
      await this.deleteBroadcast(chatId, args[0]);
      return;
    }

    if (command === '/save_video_note') {
      await this.startSaveMediaAsset(chatId, 'video_note', args[0]);
      return;
    }

    if (command === '/save_photo') {
      await this.startSaveMediaAsset(chatId, 'photo', args[0]);
      return;
    }

    if (command === '/video_notes') {
      await this.sendMediaAssets(chatId, 'video_note');
      return;
    }

    if (command === '/photos') {
      await this.sendMediaAssets(chatId, 'photo');
      return;
    }

    if (command === '/delete_video_note') {
      await this.deleteMediaAsset(chatId, 'video_note', args[0]);
      return;
    }

    if (command === '/delete_photo') {
      await this.deleteMediaAsset(chatId, 'photo', args[0]);
      return;
    }

    if (command === '/broadcast_marathon') {
      await this.startMarathonBroadcast(chatId);
      return;
    }

    if (command === '/activity') {
      await this.sendActivity(chatId, args[0]);
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      'Unknown command. Use /help or /menu.',
      this.getAdminMenuMarkup(),
    );
  }

  private isAdmin(telegramId: number) {
    return this.adminIds.has(String(telegramId));
  }

  private async handleMenuButton(
    chatId: string | number,
    text: string,
  ): Promise<boolean> {
    const context = this.getAdminMenuContext(chatId);

    if (text === ADMIN_MENU_BUTTON) {
      await this.sendHelp(chatId);
      return true;
    }

    if (text === ADMIN_BACK_BUTTON) {
      if (context?.section === 'marathonFlow') {
        await this.sendMarathonMenu(chatId);
        return true;
      }

      await this.sendHelp(chatId);
      return true;
    }

    if (text === ADMIN_STATS_BUTTON) {
      if (context?.section === 'marathonFlow') {
        await this.sendMarathonPayments(chatId, context.productSlug);
        return true;
      }

      await this.sendStats(chatId);
      return true;
    }

    if (text === ADMIN_MARATHON_MENU_BUTTON) {
      await this.sendMarathonMenu(chatId);
      return true;
    }

    if (text === ADMIN_USERS_MENU_BUTTON) {
      this.setAdminMenuContext(chatId, { section: 'users' });
      await this.sendAdminSubmenu(
        chatId,
        'Пользователи',
        this.getUsersMenuMarkup(),
      );
      return true;
    }

    if (text === ADMIN_COMMUNICATION_MENU_BUTTON) {
      this.setAdminMenuContext(chatId, { section: 'communication' });
      await this.sendAdminSubmenu(
        chatId,
        'Коммуникации',
        this.getCommunicationMenuMarkup(),
      );
      return true;
    }

    if (text === ADMIN_GRANT_SUBSCRIPTION_BUTTON) {
      this.setAdminMenuContext(chatId, { section: 'main' });
      await this.startGrantSubscription(chatId);
      return true;
    }

    if (text === ADMIN_MARATHON_4_BUTTON) {
      await this.sendMarathonFlowMenu(chatId, 'marathon-4');
      return true;
    }

    if (text === ADMIN_MARATHON_BROADCAST_BUTTON) {
      await this.startMarathonBroadcast(chatId);
      return true;
    }

    if (text === ADMIN_ALL_MARATHONS_BUTTON) {
      await this.sendMarathonFlows(chatId);
      return true;
    }

    if (text === ADMIN_USER_BUTTON) {
      await this.sendCommandHint(
        chatId,
        'User profile',
        '/user &lt;telegram_id_or_username&gt;',
        '/user @username',
      );
      return true;
    }

    if (text === ADMIN_PAYMENTS_BUTTON) {
      await this.sendCommandHint(
        chatId,
        'Latest payments',
        '/payments &lt;telegram_id_or_username&gt;',
        '/payments @username',
      );
      return true;
    }

    if (text === ADMIN_SUBSCRIPTIONS_BUTTON) {
      await this.sendCommandHint(
        chatId,
        'User subscriptions',
        '/subscriptions &lt;telegram_id_or_username&gt;',
        '/subscriptions @username',
      );
      return true;
    }

    if (text === ADMIN_ACTIVITY_BUTTON) {
      await this.sendCommandHint(
        chatId,
        'User activity',
        '/activity &lt;telegram_id_or_username&gt;',
        '/activity @username',
      );
      return true;
    }

    if (text === ADMIN_SUPPORT_BUTTON) {
      await this.sendSupport(chatId);
      return true;
    }

    if (text === ADMIN_BROADCAST_BUTTON) {
      if (context?.section === 'marathonFlow') {
        await this.startMarathonBroadcast(chatId);
        return true;
      }

      await this.startBroadcast(chatId);
      return true;
    }

    if (text === ADMIN_PAYMENT_BROADCAST_BUTTON) {
      await this.startPaymentBroadcast(chatId);
      return true;
    }

    if (text === ADMIN_SINGLE_USE_INVITE_BUTTON) {
      if (context?.section === 'marathonFlow') {
        await this.sendSingleUseInviteLink(chatId, context.productSlug);
        return true;
      }

      return false;
    }

    return false;
  }

  private getAdminMenuContext(chatId: string | number) {
    return this.adminMenuContexts.get(String(chatId));
  }

  private setAdminMenuContext(
    chatId: string | number,
    context: AdminMenuContext,
  ) {
    this.adminMenuContexts.set(String(chatId), context);
  }

  private async sendHelp(chatId: string | number) {
    this.setAdminMenuContext(chatId, { section: 'main' });

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>The Cycle Admin</b>',
        '',
        'Use buttons below or send a command manually.',
        '',
        '/stats - summary',
        '/support - open support requests',
        '/marathons - marathon flow payments',
        '/resolve_support &lt;request_id&gt; - mark support request resolved',
        '/reply_support &lt;request_id&gt; &lt;message&gt; - reply to support user',
        '/user &lt;telegram_id_or_username&gt; - user profile',
        '/payments &lt;telegram_id_or_username&gt; - latest payments',
        '/subscriptions &lt;telegram_id_or_username&gt; - user subscriptions',
        '/grant_subscription - grant The Cycle subscription by username',
        '/broadcast - send a text broadcast from the main bot',
        '/broadcast_payment - send a broadcast with a product payment button',
        '/broadcast_marathon - send marathon-4 payment broadcast',
        '/broadcasts - list recent broadcasts',
        '/delete_broadcast &lt;id&gt; - delete a broadcast from users',
        '/save_video_note &lt;key&gt; - save a broadcast video note',
        '/video_notes - list saved video notes',
        '/delete_video_note &lt;key&gt; - delete a saved video note',
        '/save_photo &lt;key&gt; - save a broadcast photo',
        '/photos - list saved photos',
        '/delete_photo &lt;key&gt; - delete a saved photo',
        '/activity &lt;telegram_id_or_username&gt; - user path',
        '/cancel - cancel current dialog',
      ].join('\n'),
      this.getAdminMenuMarkup(),
    );
  }

  private async handleMenuAction(chatId: string | number, action: string) {
    if (action === 'menu') {
      await this.sendHelp(chatId);
      return;
    }

    if (action === 'menu:marathon') {
      await this.sendMarathonMenu(chatId);
      return;
    }

    if (action === 'menu:users') {
      this.setAdminMenuContext(chatId, { section: 'users' });
      await this.sendAdminSubmenu(
        chatId,
        'Пользователи',
        this.getUsersMenuMarkup(),
      );
      return;
    }

    if (action === 'menu:communication') {
      this.setAdminMenuContext(chatId, { section: 'communication' });
      await this.sendAdminSubmenu(
        chatId,
        'Коммуникации',
        this.getCommunicationMenuMarkup(),
      );
      return;
    }

    if (action === 'stats') {
      await this.sendStats(chatId);
      return;
    }

    if (action === 'support') {
      await this.sendSupport(chatId);
      return;
    }

    if (action === 'marathons') {
      await this.sendMarathonFlows(chatId);
      return;
    }

    if (action.startsWith(MARATHON_FLOW_ACTION_PREFIX)) {
      await this.sendMarathonFlowMenu(
        chatId,
        action.slice(MARATHON_FLOW_ACTION_PREFIX.length),
      );
      return;
    }

    if (action === 'grant_subscription') {
      await this.startGrantSubscription(chatId);
      return;
    }

    if (action === 'broadcast') {
      await this.startBroadcast(chatId);
      return;
    }

    if (action === 'broadcast_payment') {
      await this.startPaymentBroadcast(chatId);
      return;
    }

    if (action === 'broadcast_marathon') {
      await this.startMarathonBroadcast(chatId);
      return;
    }

    if (action === 'user') {
      await this.sendCommandHint(
        chatId,
        'User profile',
        '/user &lt;telegram_id&gt;',
        '/user 123456789',
      );
      return;
    }

    if (action === 'payments') {
      await this.sendCommandHint(
        chatId,
        'Latest payments',
        '/payments &lt;telegram_id&gt;',
        '/payments 123456789',
      );
      return;
    }

    if (action === 'subscriptions') {
      await this.sendCommandHint(
        chatId,
        'User subscriptions',
        '/subscriptions &lt;telegram_id&gt;',
        '/subscriptions 123456789',
      );
      return;
    }

    if (action === 'activity') {
      await this.sendCommandHint(
        chatId,
        'User activity',
        '/activity &lt;telegram_id&gt;',
        '/activity 123456789',
      );
      return;
    }

    await this.sendHelp(chatId);
  }

  private async sendCommandHint(
    chatId: string | number,
    title: string,
    usage: string,
    example: string,
  ) {
    await this.telegram.sendMessage(
      chatId,
      [
        `<b>${this.escape(title)}</b>`,
        '',
        `Usage: <code>${usage}</code>`,
        `Example: <code>${example}</code>`,
      ].join('\n'),
      this.getAdminMenuMarkup(),
    );
  }

  private async sendAdminSubmenu(
    chatId: string | number,
    title: string,
    replyMarkup: Record<string, unknown>,
  ) {
    await this.telegram.sendMessage(
      chatId,
      [`<b>${this.escape(title)}</b>`, '', 'Выберите действие:'].join('\n'),
      replyMarkup,
    );
  }

  private async sendMarathonMenu(chatId: string | number) {
    this.setAdminMenuContext(chatId, { section: 'marathonList' });
    await this.sendAdminSubmenu(
      chatId,
      'Марафон',
      this.getMarathonMenuMarkup(),
    );
  }

  private async sendMarathonFlowMenu(
    chatId: string | number,
    productSlug: string,
  ) {
    this.setAdminMenuContext(chatId, {
      section: 'marathonFlow',
      productSlug,
    });

    await this.sendAdminSubmenu(
      chatId,
      this.getMarathonFlowMenuTitle(productSlug),
      this.getMarathonFlowMenuMarkup(),
    );
  }

  private async sendStats(chatId: string | number) {
    const [
      usersCount,
      activeSubscriptions,
      pendingPayments,
      paidPayments,
      failedPayments,
      openSupport,
    ] = await Promise.all([
      this.users.count(),
      this.subscriptions.count({
        where: { status: SubscriptionStatus.Active },
      }),
      this.payments.count({ where: { status: PaymentAttemptStatus.Pending } }),
      this.payments.count({ where: { status: PaymentAttemptStatus.Paid } }),
      this.payments.count({ where: { status: PaymentAttemptStatus.Failed } }),
      this.supportRequests.count({
        where: { status: SupportRequestStatus.Open },
      }),
    ]);

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Stats</b>',
        '',
        `Users: ${usersCount}`,
        `Active subscriptions: ${activeSubscriptions}`,
        `Payments pending: ${pendingPayments}`,
        `Payments paid: ${paidPayments}`,
        `Payments failed: ${failedPayments}`,
        `Open support: ${openSupport}`,
      ].join('\n'),
    );
  }

  private async sendMarathonFlows(chatId: string | number) {
    const products = await this.products.find({
      where: { slug: Like(`${MARATHON_PRODUCT_SLUG_PREFIX}%`) },
      order: { createdAt: 'ASC' },
    });

    if (products.length === 0) {
      await this.telegram.sendMessage(chatId, 'No marathon flows found.');
      return;
    }

    const sortedProducts = [...products].sort((a, b) => {
      const flowNumberDiff =
        this.getMarathonFlowNumber(a) - this.getMarathonFlowNumber(b);

      return flowNumberDiff || a.slug.localeCompare(b.slug);
    });

    await this.telegram.sendMessage(
      chatId,
      '<b>Марафоны</b>\n\nВыберите поток:',
      {
        inline_keyboard: [
          ...sortedProducts.map((product) => [
            {
              text: this.getMarathonFlowButtonText(product),
              callback_data: `${ADMIN_MENU_PREFIX}${MARATHON_FLOW_ACTION_PREFIX}${product.slug}`,
            },
          ]),
          [
            {
              text: '☰ Меню',
              callback_data: `${ADMIN_MENU_PREFIX}menu`,
            },
          ],
        ],
      },
    );
  }

  private async sendMarathonPayments(
    chatId: string | number,
    productSlug: string,
  ) {
    if (!productSlug.startsWith(MARATHON_PRODUCT_SLUG_PREFIX)) {
      await this.telegram.sendMessage(chatId, 'Unknown marathon flow.');
      return;
    }

    const product = await this.products.findOne({
      where: { slug: productSlug },
    });

    if (!product) {
      await this.telegram.sendMessage(chatId, 'Marathon flow not found.');
      return;
    }

    const summary = await this.payments
      .createQueryBuilder('payment')
      .select('COUNT(payment.id)', 'count')
      .addSelect('COALESCE(SUM(payment.amount), 0)', 'amount')
      .where('payment.productId = :productId', { productId: product.id })
      .andWhere('payment.status = :status', {
        status: PaymentAttemptStatus.Paid,
      })
      .getRawOne<{ count: string; amount: string }>();
    const paidCount = Number(summary?.count ?? 0);
    const totalAmount = summary?.amount ?? '0.00';

    const payments = await this.payments.find({
      where: {
        productId: product.id,
        status: PaymentAttemptStatus.Paid,
      },
      relations: { user: true },
      order: { paidAt: 'DESC', createdAt: 'DESC' },
      take: 50,
    });

    const lines = [
      `<b>${this.escape(product.title)}</b>`,
      '',
      `Оплат: ${paidCount}`,
      `Сумма: ${this.escape(totalAmount)} ${this.escape(product.currency)}`,
    ];

    if (payments.length === 0) {
      await this.telegram.sendMessage(
        chatId,
        [...lines, '', 'Оплат пока нет.'].join('\n'),
      );
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      [
        ...lines,
        '',
        paidCount > payments.length
          ? `<i>Показаны последние ${payments.length} из ${paidCount} оплат.</i>`
          : '',
        ...payments.map((payment, index) =>
          [
            `${index + 1}. ${this.formatUser(payment.user)}`,
            `Telegram ID: <code>${this.escape(payment.user.telegramId)}</code>`,
            `Сумма: ${this.escape(payment.amount)} ${this.escape(payment.currency)}`,
            `Дата оплаты: ${this.formatDate(payment.paidAt)}`,
          ].join('\n'),
        ),
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  }

  private async sendUser(chatId: string | number, telegramId?: string) {
    const user = await this.findUserOrReply(chatId, telegramId);
    if (!user) {
      return;
    }

    const [subscriptionsCount, paymentsCount, activityCount] =
      await Promise.all([
        this.subscriptions.count({ where: { userId: user.id } }),
        this.payments.count({ where: { userId: user.id } }),
        this.activity.count({ where: { userId: user.id } }),
      ]);

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>User</b>',
        '',
        `Telegram ID: <code>${this.escape(user.telegramId)}</code>`,
        `Username: ${this.escape(user.username ? `@${user.username}` : '-')}`,
        `Name: ${this.escape([user.firstName, user.lastName].filter(Boolean).join(' ') || '-')}`,
        `Language: ${this.escape(user.languageCode ?? '-')}`,
        `Membership: ${this.escape(user.membershipStatus)}`,
        `Created: ${this.formatDate(user.createdAt)}`,
        '',
        `Subscriptions: ${subscriptionsCount}`,
        `Payments: ${paymentsCount}`,
        `Activity events: ${activityCount}`,
      ].join('\n'),
    );
  }

  private async sendPayments(chatId: string | number, telegramId?: string) {
    const user = await this.findUserOrReply(chatId, telegramId);
    if (!user) {
      return;
    }

    const payments = await this.payments.find({
      where: { userId: user.id },
      relations: { product: true },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    if (payments.length === 0) {
      await this.telegram.sendMessage(chatId, 'No payments found.');
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      [
        `<b>Payments for ${this.escape(user.telegramId)}</b>`,
        '',
        ...payments.map((payment) =>
          [
            `${this.formatDate(payment.createdAt)} - <b>${this.escape(payment.status)}</b>`,
            `${this.escape(payment.product.title)}: ${this.escape(payment.amount)} ${this.escape(payment.currency)}`,
            `Provider: ${this.escape(payment.provider)}`,
            `Order: <code>${this.escape(payment.providerOrderId)}</code>`,
            payment.paidAt ? `Paid: ${this.formatDate(payment.paidAt)}` : '',
            payment.rawPayload?.reasonCode
              ? `Reason: ${this.escape(String(payment.rawPayload.reasonCode))}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      ].join('\n\n'),
    );
  }

  private async sendSubscriptions(
    chatId: string | number,
    telegramId?: string,
  ) {
    const user = await this.findUserOrReply(chatId, telegramId);
    if (!user) {
      return;
    }

    const subscriptions = await this.subscriptions.find({
      where: { userId: user.id },
      relations: { product: true },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    if (subscriptions.length === 0) {
      await this.telegram.sendMessage(chatId, 'No subscriptions found.');
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      [
        `<b>Subscriptions for ${this.escape(user.telegramId)}</b>`,
        '',
        ...subscriptions.map((subscription) =>
          [
            `<b>${this.escape(subscription.product.title)}</b>`,
            `Status: ${this.escape(subscription.status)}`,
            `Starts: ${this.formatDate(subscription.startsAt)}`,
            `Expires: ${this.formatDate(subscription.expiresAt)}`,
          ].join('\n'),
        ),
      ].join('\n\n'),
    );
  }

  private async sendActivity(chatId: string | number, telegramId?: string) {
    const user = await this.findUserOrReply(chatId, telegramId);
    if (!user) {
      return;
    }

    const events = await this.activity.find({
      where: { userId: user.id },
      order: { createdAt: 'ASC' },
      take: 30,
    });

    if (events.length === 0) {
      await this.telegram.sendMessage(chatId, 'No activity found.');
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      [
        `<b>Activity for ${this.escape(user.telegramId)}</b>`,
        '',
        ...events.map((event) =>
          [
            `${this.formatDate(event.createdAt)} - <b>${this.escape(event.eventName)}</b>`,
            `Type: ${this.escape(event.eventType)}`,
            this.formatPayload(event.payload),
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      ].join('\n\n'),
    );
  }

  private async startGrantSubscription(chatId: string | number) {
    this.grantSubscriptionSessions.set(String(chatId), { step: 'username' });

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Grant The Cycle subscription</b>',
        '',
        'Send user username, for example: <code>@username</code>',
        'Use /cancel to cancel.',
      ].join('\n'),
    );
  }

  private async handleGrantSubscriptionStep(
    chatId: string | number,
    text: string,
    session: GrantSubscriptionSession,
  ) {
    if (session.step === 'username') {
      const username = this.normalizeUsername(text);

      if (!username) {
        await this.telegram.sendMessage(
          chatId,
          'Send a valid Telegram username, for example: <code>@username</code>',
        );
        return;
      }

      const user = await this.findUserByUsername(username);
      if (!user) {
        await this.telegram.sendMessage(
          chatId,
          `User @${this.escape(username)} not found. Send another username or /cancel.`,
        );
        return;
      }

      this.grantSubscriptionSessions.set(String(chatId), {
        step: 'expiresAt',
        username,
      });

      await this.telegram.sendMessage(
        chatId,
        [
          `User found: ${this.formatUser(user)}`,
          '',
          'Send subscription end date.',
          'Formats: <code>31.12.2026</code>, <code>2026-12-31</code>, or <code>31.12.2026 18:30</code>.',
        ].join('\n'),
      );
      return;
    }

    const expiresAt = this.parseSubscriptionEndDate(text);
    if (!expiresAt) {
      await this.telegram.sendMessage(
        chatId,
        [
          'Invalid date.',
          'Use <code>31.12.2026</code>, <code>2026-12-31</code>, or <code>31.12.2026 18:30</code>.',
        ].join('\n'),
      );
      return;
    }

    if (expiresAt <= new Date()) {
      await this.telegram.sendMessage(
        chatId,
        'Date must be in the future. Send another date or /cancel.',
      );
      return;
    }

    const user = await this.findUserByUsername(session.username);
    if (!user) {
      this.grantSubscriptionSessions.delete(String(chatId));
      await this.telegram.sendMessage(
        chatId,
        `User @${this.escape(session.username)} no longer exists. Start again with /grant_subscription.`,
      );
      return;
    }

    const product = await this.products.findOne({
      where: { slug: GRANT_SUBSCRIPTION_PRODUCT_SLUG },
    });
    if (!product) {
      this.grantSubscriptionSessions.delete(String(chatId));
      await this.telegram.sendMessage(
        chatId,
        `Product ${this.escape(GRANT_SUBSCRIPTION_PRODUCT_SLUG)} not found.`,
      );
      return;
    }

    const subscription = await this.grantSubscription(user, product, expiresAt);
    const inviteDelivery = await this.sendGrantedSubscriptionInvite(
      user,
      product,
      subscription,
    );
    this.grantSubscriptionSessions.delete(String(chatId));

    await this.telegram.sendMessage(
      chatId,
      [
        '✅ <b>Subscription granted</b>',
        '',
        `User: ${this.formatUser(user)}`,
        `Telegram ID: <code>${this.escape(user.telegramId)}</code>`,
        `Product: ${this.escape(product.title)}`,
        `Status: ${this.escape(subscription.status)}`,
        `Expires: ${this.formatDate(subscription.expiresAt)}`,
        '',
        this.formatInviteDeliveryResult(inviteDelivery),
      ].join('\n'),
    );
  }

  private async sendGrantedSubscriptionInvite(
    user: User,
    product: Product,
    subscription: Subscription,
  ): Promise<InviteDeliveryResult> {
    const groupChatId = this.config.get<string>(CLOSED_GROUP_CHAT_ID);
    if (!groupChatId) {
      return {
        status: 'skipped',
        reason: `${CLOSED_GROUP_CHAT_ID} is not configured`,
      };
    }

    try {
      const invite = await this.inviteLinks.createSingleUseInviteLink({
        chatId: groupChatId,
        name: this.buildGrantedSubscriptionInviteLinkName(user),
      });

      const response = (await this.mainTelegram.sendMessage(
        user.telegramId,
        [
          'Доступ к The Cycle открыт ✅',
          '',
          `Продукт: ${this.escape(product.title)}`,
          `Подписка активна до ${this.formatDate(subscription.expiresAt)}`,
          '',
          'Ссылка индивидуальная и рассчитана на одно вступление.',
        ].join('\n'),
        {
          inline_keyboard: [
            [
              {
                text: 'Перейти в клуб ✅',
                url: invite.inviteLink,
              },
            ],
          ],
        },
      )) as { ok: boolean; description?: string };

      if (!response.ok) {
        return {
          status: 'failed',
          reason: response.description ?? 'Telegram sendMessage failed',
        };
      }

      return { status: 'sent', inviteLink: invite.inviteLink };
    } catch (error) {
      return {
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private formatInviteDeliveryResult(result: InviteDeliveryResult) {
    if (result.status === 'sent') {
      return 'Invite: sent to user';
    }

    return `Invite: ${result.status} - ${this.escape(result.reason)}`;
  }

  private async grantSubscription(
    user: User,
    product: Product,
    expiresAt: Date,
  ) {
    let subscription = await this.subscriptions.findOne({
      where: {
        userId: user.id,
        productId: product.id,
        status: SubscriptionStatus.Active,
      },
    });

    if (!subscription) {
      subscription = this.subscriptions.create({
        user,
        userId: user.id,
        product,
        productId: product.id,
      });
    }

    subscription.status = SubscriptionStatus.Active;
    subscription.startsAt = subscription.startsAt ?? new Date();
    subscription.expiresAt = expiresAt;
    subscription.reminded5DaysAt = null;
    subscription.reminded1DayAt = null;
    user.membershipStatus = 'active';

    const saved = await this.subscriptions.save(subscription);
    await this.users.save(user);

    return saved;
  }

  private getAdminMenuMarkup() {
    return {
      keyboard: [
        [{ text: ADMIN_STATS_BUTTON }],
        [{ text: ADMIN_MARATHON_MENU_BUTTON }],
        [{ text: ADMIN_USERS_MENU_BUTTON }],
        [{ text: ADMIN_COMMUNICATION_MENU_BUTTON }],
        [{ text: ADMIN_PAYMENT_BROADCAST_BUTTON }],
        [{ text: ADMIN_GRANT_SUBSCRIPTION_BUTTON }],
        [{ text: ADMIN_MENU_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      is_persistent: true,
      selective: true,
    };
  }

  private getMarathonMenuMarkup() {
    return {
      keyboard: [
        [{ text: ADMIN_MARATHON_4_BUTTON }],
        [{ text: ADMIN_BACK_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      is_persistent: true,
      selective: true,
    };
  }

  private getMarathonFlowMenuMarkup() {
    return {
      keyboard: [
        [{ text: ADMIN_STATS_BUTTON }],
        [{ text: ADMIN_BROADCAST_BUTTON }],
        [{ text: ADMIN_SINGLE_USE_INVITE_BUTTON }],
        [{ text: ADMIN_BACK_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      is_persistent: true,
      selective: true,
    };
  }

  private getUsersMenuMarkup() {
    return {
      keyboard: [
        [{ text: ADMIN_USER_BUTTON }],
        [{ text: ADMIN_PAYMENTS_BUTTON }, { text: ADMIN_SUBSCRIPTIONS_BUTTON }],
        [{ text: ADMIN_ACTIVITY_BUTTON }],
        [{ text: ADMIN_BACK_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      is_persistent: true,
      selective: true,
    };
  }

  private getCommunicationMenuMarkup() {
    return {
      keyboard: [
        [{ text: ADMIN_SUPPORT_BUTTON }],
        [{ text: ADMIN_BROADCAST_BUTTON }],
        [{ text: ADMIN_PAYMENT_BROADCAST_BUTTON }],
        [{ text: ADMIN_BACK_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      is_persistent: true,
      selective: true,
    };
  }

  private getBroadcastTextKeyboardMarkup() {
    return {
      keyboard: [[{ text: BROADCAST_CANCEL_BUTTON }]],
      resize_keyboard: true,
      one_time_keyboard: false,
      selective: true,
    };
  }

  private getBroadcastConfirmKeyboardMarkup() {
    return {
      keyboard: [
        [{ text: BROADCAST_CONFIRM_BUTTON }],
        [{ text: BROADCAST_CANCEL_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      selective: true,
    };
  }

  private getBroadcastButtonTextKeyboardMarkup() {
    return {
      keyboard: [
        [{ text: BROADCAST_SKIP_BUTTON }],
        [{ text: BROADCAST_CANCEL_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      selective: true,
    };
  }

  private getBroadcastMediaKeyboardMarkup() {
    return {
      keyboard: [
        [{ text: BROADCAST_PHOTO_BUTTON }],
        [{ text: BROADCAST_VIDEO_NOTE_BUTTON }],
        [{ text: BROADCAST_SKIP_MEDIA_BUTTON }],
        [{ text: BROADCAST_CANCEL_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      selective: true,
    };
  }

  private getMarathonBroadcastTextKeyboardMarkup() {
    return {
      keyboard: [
        [{ text: MARATHON_DEFAULT_TEXT_BUTTON }],
        [{ text: BROADCAST_CANCEL_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      selective: true,
    };
  }

  private getMarathonBroadcastButtonTextKeyboardMarkup() {
    return {
      keyboard: [
        [{ text: MARATHON_DEFAULT_BUTTON_TEXT_BUTTON }],
        [{ text: BROADCAST_CANCEL_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      selective: true,
    };
  }

  private getPaymentBroadcastProductKeyboardMarkup(products: Product[]) {
    return {
      keyboard: [
        ...products.map((product) => [
          { text: this.formatPaymentBroadcastProductChoice(product) },
        ]),
        [{ text: BROADCAST_CANCEL_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      selective: true,
    };
  }

  private getPaymentBroadcastButtonTextKeyboardMarkup() {
    return {
      keyboard: [
        [{ text: PAYMENT_BROADCAST_DEFAULT_BUTTON_TEXT_BUTTON }],
        [{ text: BROADCAST_CANCEL_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      selective: true,
    };
  }

  private getBroadcastInlineButtonMarkup(button?: BroadcastButton) {
    if (!button) {
      return undefined;
    }

    if (button.callbackData) {
      return {
        inline_keyboard: [
          [{ text: button.text, callback_data: button.callbackData }],
        ],
      };
    }

    return {
      inline_keyboard: [[{ text: button.text, url: button.url }]],
    };
  }

  private getRemoveKeyboardMarkup() {
    return {
      remove_keyboard: true,
      selective: true,
    };
  }

  private async startSaveMediaAsset(
    chatId: string | number,
    type: BroadcastMediaAsset['type'],
    rawKey?: string,
  ) {
    const key = rawKey ? this.normalizeMediaAssetKey(rawKey) : null;
    const command = type === 'photo' ? '/save_photo' : '/save_video_note';
    const exampleKey = type === 'photo' ? 'launch_photo' : 'morning_offer';
    const label = this.getMediaTypeLabel(type);
    if (!key) {
      await this.telegram.sendMessage(
        chatId,
        [
          `Usage: <code>${command} &lt;key&gt;</code>`,
          'Key can contain latin letters, numbers, underscore, and dash.',
          `Example: <code>${command} ${exampleKey}</code>`,
        ].join('\n'),
      );
      return;
    }

    this.saveMediaAssetSessions.set(String(chatId), { type, key });

    await this.telegram.sendMessage(
      chatId,
      [
        `<b>Save ${label}: ${this.escape(key)}</b>`,
        '',
        `Send a Telegram ${label} now.`,
        'Use /cancel to cancel.',
      ].join('\n'),
    );
  }

  private async handleSaveMediaAssetStep(
    message: TelegramMessage,
    session: SaveMediaAssetSession,
  ) {
    const chatId = message.chat.id;
    const label = this.getMediaTypeLabel(session.type);
    const result = await this.saveBroadcastMediaAssetFromMessage(
      message,
      session.type,
      session.key,
    );
    if (!result.ok) {
      await this.telegram.sendMessage(chatId, result.message);
      return;
    }

    const { asset } = result;
    this.saveMediaAssetSessions.delete(String(chatId));

    await this.telegram.sendMessage(
      chatId,
      [
        `✅ <b>${this.capitalize(label)} saved</b>`,
        '',
        `Key: <code>${this.escape(asset.key)}</code>`,
        ...(asset.duration
          ? [`Duration: ${this.escape(String(asset.duration))} sec`]
          : []),
        ...(asset.width && asset.height
          ? [`Size: ${asset.width}x${asset.height}`]
          : []),
        `Size: ${this.formatBytes(asset.fileSize ?? asset.fileData.length)}`,
      ].join('\n'),
    );
  }

  private async saveBroadcastMediaAssetFromMessage(
    message: TelegramMessage,
    type: BroadcastMediaAsset['type'],
    key: string,
  ): Promise<
    | {
        ok: true;
        asset: BroadcastMediaAsset;
      }
    | {
        ok: false;
        message: string;
      }
  > {
    const mediaFile = this.getMessageMediaFile(message, type);
    const label = this.getMediaTypeLabel(type);
    if (!mediaFile) {
      return {
        ok: false,
        message: `Send a Telegram ${label}, or /cancel.`,
      };
    }

    const fileResponse = await this.telegram.getFile(mediaFile.fileId);
    const filePath = fileResponse.result?.file_path;
    if (!fileResponse.ok || !filePath) {
      return {
        ok: false,
        message: `Could not read ${label} file: ${this.escape(fileResponse.description ?? 'missing file path')}`,
      };
    }

    const fileData = await this.telegram.downloadFile(filePath);
    if (!fileData) {
      return {
        ok: false,
        message: `Could not download ${label}.`,
      };
    }

    let asset = await this.broadcastMediaAssets.findOne({
      where: { key },
    });

    if (!asset) {
      asset = this.broadcastMediaAssets.create({ type, key });
    }

    asset.type = type;
    asset.adminFileId = mediaFile.fileId;
    asset.fileUniqueId = mediaFile.fileUniqueId ?? null;
    asset.fileData = fileData;
    asset.fileSize = mediaFile.fileSize ?? fileData.length;
    asset.duration = mediaFile.duration ?? null;
    asset.length = mediaFile.length ?? null;
    asset.width = mediaFile.width ?? null;
    asset.height = mediaFile.height ?? null;
    asset.createdByTelegramId = String(message.from?.id ?? '');

    return {
      ok: true,
      asset: await this.broadcastMediaAssets.save(asset),
    };
  }

  private getMessageMediaFile(
    message: TelegramMessage,
    type: BroadcastMediaAsset['type'],
  ) {
    if (type === 'video_note') {
      const videoNote = message.video_note;
      return videoNote
        ? {
            fileId: videoNote.file_id,
            fileUniqueId: videoNote.file_unique_id,
            fileSize: videoNote.file_size,
            duration: videoNote.duration,
            length: videoNote.length,
          }
        : null;
    }

    const photo = message.photo
      ? [...message.photo].sort(
          (left, right) =>
            (right.file_size ?? right.width * right.height) -
            (left.file_size ?? left.width * left.height),
        )[0]
      : undefined;

    return photo
      ? {
          fileId: photo.file_id,
          fileUniqueId: photo.file_unique_id,
          fileSize: photo.file_size,
          width: photo.width,
          height: photo.height,
        }
      : null;
  }

  private async sendMediaAssets(
    chatId: string | number,
    type: BroadcastMediaAsset['type'],
  ) {
    const assets = await this.broadcastMediaAssets.find({
      where: { type },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const label = this.getMediaTypeLabel(type);
    const choiceButton =
      type === 'photo' ? BROADCAST_PHOTO_BUTTON : BROADCAST_VIDEO_NOTE_BUTTON;

    if (assets.length === 0) {
      await this.telegram.sendMessage(chatId, `No saved ${label}s.`);
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      [
        `<b>Saved ${label}s</b>`,
        '',
        ...assets.map((asset, index) =>
          [
            `${index + 1}. <code>${this.escape(asset.key)}</code>`,
            ...(asset.duration
              ? [`Duration: ${this.escape(String(asset.duration))} sec`]
              : []),
            ...(asset.width && asset.height
              ? [`Image: ${asset.width}x${asset.height}`]
              : []),
            `Size: ${this.formatBytes(asset.fileSize ?? asset.fileData?.length ?? 0)}`,
            `Use: <code>/broadcast</code> then choose ${choiceButton}`,
          ].join('\n'),
        ),
      ].join('\n\n'),
    );
  }

  private async deleteMediaAsset(
    chatId: string | number,
    type: BroadcastMediaAsset['type'],
    rawKey?: string,
  ) {
    const key = rawKey ? this.normalizeMediaAssetKey(rawKey) : null;
    const command = type === 'photo' ? '/delete_photo' : '/delete_video_note';
    const label = this.getMediaTypeLabel(type);
    if (!key) {
      await this.telegram.sendMessage(
        chatId,
        `Usage: <code>${command} &lt;key&gt;</code>`,
      );
      return;
    }

    const result = await this.broadcastMediaAssets.delete({
      type,
      key,
    });

    await this.telegram.sendMessage(
      chatId,
      result.affected
        ? `Deleted ${label} <code>${this.escape(key)}</code>.`
        : `${this.capitalize(label)} <code>${this.escape(key)}</code> not found.`,
    );
  }

  private async startBroadcast(chatId: string | number) {
    if (this.broadcastInProgress) {
      await this.telegram.sendMessage(
        chatId,
        'Another broadcast is already running. Try again later.',
      );
      return;
    }

    this.broadcastSessions.set(String(chatId), { step: 'message' });

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Broadcast from main bot</b>',
        '',
        'Send the text message for all users.',
        'The text will be sent as plain text from the main bot.',
        `After that you can add one URL button or tap ${BROADCAST_SKIP_BUTTON}.`,
        `Use ${BROADCAST_CANCEL_BUTTON} or /cancel to cancel.`,
      ].join('\n'),
      this.getBroadcastTextKeyboardMarkup(),
    );
  }

  private async startMarathonBroadcast(chatId: string | number) {
    if (this.broadcastInProgress) {
      await this.telegram.sendMessage(
        chatId,
        'Another broadcast is already running. Try again later.',
      );
      return;
    }

    if (!(await this.getMarathonBroadcastButton())) {
      await this.telegram.sendMessage(
        chatId,
        'Marathon payment button is not configured.',
      );
      return;
    }

    this.broadcastSessions.set(String(chatId), { step: 'marathonMessage' });

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Marathon payment broadcast</b>',
        '',
        'Send the text for the marathon broadcast.',
        `Tap ${MARATHON_DEFAULT_TEXT_BUTTON} to use the text from the marathon screen.`,
        `Use ${BROADCAST_CANCEL_BUTTON} or /cancel to cancel.`,
      ].join('\n'),
      this.getMarathonBroadcastTextKeyboardMarkup(),
    );
  }

  private async startPaymentBroadcast(chatId: string | number) {
    if (this.broadcastInProgress) {
      await this.telegram.sendMessage(
        chatId,
        'Another broadcast is already running. Try again later.',
      );
      return;
    }

    const products = await this.getPaymentBroadcastProducts();
    if (products.length === 0) {
      await this.telegram.sendMessage(chatId, 'No active products found.');
      return;
    }

    this.broadcastSessions.set(String(chatId), {
      step: 'paymentProductChoice',
    });

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Payment broadcast</b>',
        '',
        'Choose a product for the payment button.',
        'The user will receive a payment callback button, and the main bot will create an individual WayForPay attempt after click.',
        `Use ${BROADCAST_CANCEL_BUTTON} or /cancel to cancel.`,
      ].join('\n'),
      this.getPaymentBroadcastProductKeyboardMarkup(products),
    );
  }

  private async getPaymentBroadcastProducts() {
    const products = await this.products.find({
      where: { isActive: true },
      order: { createdAt: 'ASC' },
    });

    return products.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  private async askPaymentBroadcastText(
    chatId: string | number,
    product: Product,
  ) {
    this.broadcastSessions.set(String(chatId), {
      step: 'paymentMessage',
      productSlug: product.slug,
    });

    await this.telegram.sendMessage(
      chatId,
      [
        `<b>Payment broadcast: ${this.escape(product.title)}</b>`,
        '',
        `Price: ${this.escape(product.price)} ${this.escape(product.currency)}`,
        '',
        'Send the broadcast text.',
      ].join('\n'),
      this.getBroadcastTextKeyboardMarkup(),
    );
  }

  private async askPaymentBroadcastButtonText(
    chatId: string | number,
    productSlug: string,
    text: string,
    media?: BroadcastMedia,
  ) {
    const product = await this.products.findOne({
      where: { slug: productSlug, isActive: true },
    });

    if (!product) {
      this.broadcastSessions.delete(String(chatId));
      await this.telegram.sendMessage(
        chatId,
        'Product is no longer available.',
        this.getRemoveKeyboardMarkup(),
      );
      return;
    }

    this.broadcastSessions.set(String(chatId), {
      step: 'paymentButtonText',
      productSlug,
      text,
      media,
    });

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Payment button</b>',
        '',
        'Send the button text.',
        `Tap ${PAYMENT_BROADCAST_DEFAULT_BUTTON_TEXT_BUTTON} to use: ${this.escape(
          this.getDefaultPaymentBroadcastButtonText(product),
        )}`,
      ].join('\n'),
      this.getPaymentBroadcastButtonTextKeyboardMarkup(),
    );
  }

  private async preparePaymentBroadcastPreview(
    chatId: string | number,
    productSlug: string,
    text: string,
    media: BroadcastMedia | undefined,
    buttonText?: string,
  ) {
    const product = await this.products.findOne({
      where: { slug: productSlug, isActive: true },
    });

    if (!product) {
      this.broadcastSessions.delete(String(chatId));
      await this.telegram.sendMessage(
        chatId,
        'Product is no longer available.',
        this.getRemoveKeyboardMarkup(),
      );
      return;
    }

    await this.prepareBroadcastPreview(
      chatId,
      text,
      this.getPaymentBroadcastButton(product, buttonText),
      media,
    );
  }

  private async prepareMarathonBroadcastPreview(
    chatId: string | number,
    text: string,
    buttonText?: string,
  ) {
    const button = await this.getMarathonBroadcastButton();
    if (!button) {
      this.broadcastSessions.delete(String(chatId));
      await this.telegram.sendMessage(
        chatId,
        'Marathon payment button is not configured.',
        this.getRemoveKeyboardMarkup(),
      );
      return;
    }

    await this.askBroadcastMediaChoice(chatId, text, {
      ...button,
      text: buttonText ?? button.text,
    });
  }

  private async getMarathonBroadcastButton(): Promise<CallbackBroadcastButton | null> {
    const product = await this.products.findOne({
      where: { slug: MARATHON_BROADCAST_PRODUCT_SLUG, isActive: true },
    });

    if (!product) {
      return null;
    }

    const keyboard = this.flow.buildScreenInlineKeyboard(
      MARATHON_BROADCAST_SCREEN_ID,
      {
        productsBySlug: {
          [product.slug]: {
            price: product.price,
            currency: product.currency,
          },
        },
      },
    );
    const paymentButton = keyboard
      ?.flat()
      .find(
        (button) =>
          button.callback_data ===
          `${PAYMENT_CALLBACK_PREFIX}${MARATHON_BROADCAST_PRODUCT_SLUG}`,
      );

    if (!paymentButton?.callback_data) {
      return null;
    }

    return {
      text: paymentButton.text,
      callbackData: paymentButton.callback_data,
    };
  }

  private async askMarathonBroadcastButtonText(
    chatId: string | number,
    text: string,
  ) {
    this.broadcastSessions.set(String(chatId), {
      step: 'marathonButtonText',
      text,
    });

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Marathon payment button</b>',
        '',
        'Send the button text.',
        `Tap ${MARATHON_DEFAULT_BUTTON_TEXT_BUTTON} to use the configured button text.`,
        'Example: Оплатить марафон',
      ].join('\n'),
      this.getMarathonBroadcastButtonTextKeyboardMarkup(),
    );
  }

  private async sendSingleUseInviteLink(
    chatId: string | number,
    productSlug: string,
  ) {
    const channelChatId = this.config.get<string>(MARATHON_CHANNEL_CHAT_ID);
    if (!channelChatId) {
      await this.telegram.sendMessage(
        chatId,
        `Не задан <code>${MARATHON_CHANNEL_CHAT_ID}</code>.`,
      );
      return;
    }

    try {
      const invite = await this.inviteLinks.createSingleUseInviteLink({
        chatId: channelChatId,
        name: this.buildAdminInviteLinkName(productSlug),
        expireInSeconds: this.getMarathonInviteExpiresInSeconds(),
      });

      await this.telegram.sendMessage(
        chatId,
        [
          '✅ <b>Разовая инвайт-ссылка готова</b>',
          '',
          `Поток: ${this.escape(this.getMarathonFlowMenuTitle(productSlug))}`,
          'Лимит: 1 вступление',
          invite.expireDate
            ? `Действует до: ${this.formatDate(new Date(invite.expireDate * 1000))}`
            : 'Срок действия: без ограничения',
          '',
          `<code>${this.escape(invite.inviteLink)}</code>`,
        ].join('\n'),
        {
          inline_keyboard: [
            [
              {
                text: 'Открыть ссылку',
                url: invite.inviteLink,
              },
            ],
          ],
        },
      );
    } catch (error) {
      await this.telegram.sendMessage(
        chatId,
        [
          'Не удалось создать инвайт-ссылку.',
          '',
          this.escape(error instanceof Error ? error.message : String(error)),
        ].join('\n'),
      );
    }
  }

  private getMarathonInviteExpiresInSeconds(): number | undefined {
    const raw = this.config.get<string>(MARATHON_INVITE_EXPIRES_IN_SECONDS);
    if (!raw) {
      return undefined;
    }

    const seconds = Number(raw);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
  }

  private buildAdminInviteLinkName(productSlug: string) {
    return `${productSlug}:admin:${Date.now()}`;
  }

  private buildGrantedSubscriptionInviteLinkName(user: User) {
    return `${GRANT_SUBSCRIPTION_PRODUCT_SLUG}:grant:${user.telegramId}:${Date.now()}`;
  }

  private async handleBroadcastStep(
    chatId: string | number,
    text: string,
    command: string,
    message: TelegramMessage,
    session: BroadcastSession,
  ) {
    if (session.step === 'paymentProductChoice') {
      const products = await this.getPaymentBroadcastProducts();
      const product = this.findPaymentBroadcastProductChoice(text, products);

      if (!product) {
        await this.telegram.sendMessage(
          chatId,
          'Choose a product from the keyboard.',
          this.getPaymentBroadcastProductKeyboardMarkup(products),
        );
        return;
      }

      await this.askPaymentBroadcastText(chatId, product);
      return;
    }

    if (session.step === 'paymentMessage') {
      if (!text || text.startsWith('/')) {
        await this.telegram.sendMessage(
          chatId,
          'Send a non-empty payment broadcast text or cancel the broadcast.',
          this.getBroadcastTextKeyboardMarkup(),
        );
        return;
      }

      this.broadcastSessions.set(String(chatId), {
        step: 'paymentMediaChoice',
        productSlug: session.productSlug,
        text,
      });

      await this.telegram.sendMessage(
        chatId,
        [
          '<b>Payment broadcast media</b>',
          '',
          `Choose ${BROADCAST_PHOTO_BUTTON}, ${BROADCAST_VIDEO_NOTE_BUTTON}, or skip media.`,
        ].join('\n'),
        this.getBroadcastMediaKeyboardMarkup(),
      );
      return;
    }

    if (session.step === 'paymentMediaChoice') {
      if (text === BROADCAST_SKIP_MEDIA_BUTTON) {
        await this.askPaymentBroadcastButtonText(
          chatId,
          session.productSlug,
          session.text,
        );
        return;
      }

      if (
        text !== BROADCAST_VIDEO_NOTE_BUTTON &&
        text !== BROADCAST_PHOTO_BUTTON
      ) {
        await this.telegram.sendMessage(
          chatId,
          'Choose broadcast media or skip it.',
          this.getBroadcastMediaKeyboardMarkup(),
        );
        return;
      }

      const mediaType =
        text === BROADCAST_PHOTO_BUTTON ? 'photo' : 'video_note';
      const label = this.getMediaTypeLabel(mediaType);
      const listCommand = mediaType === 'photo' ? '/photos' : '/video_notes';
      this.broadcastSessions.set(String(chatId), {
        step: mediaType === 'photo' ? 'paymentPhotoKey' : 'paymentVideoNoteKey',
        productSlug: session.productSlug,
        text: session.text,
      });

      await this.telegram.sendMessage(
        chatId,
        [
          `<b>Payment broadcast ${label}</b>`,
          '',
          mediaType === 'photo'
            ? 'Send a saved photo key or upload a photo now.'
            : `Send saved ${label} key.`,
          `Use <code>${listCommand}</code> to see saved keys.`,
        ].join('\n'),
        this.getBroadcastTextKeyboardMarkup(),
      );
      return;
    }

    if (
      session.step === 'paymentVideoNoteKey' ||
      session.step === 'paymentPhotoKey'
    ) {
      const type = session.step === 'paymentPhotoKey' ? 'photo' : 'video_note';
      const label = this.getMediaTypeLabel(type);
      const listCommand = type === 'photo' ? '/photos' : '/video_notes';

      if (type === 'photo' && message.photo?.length) {
        const result = await this.saveBroadcastMediaAssetFromMessage(
          message,
          'photo',
          this.buildAutoBroadcastMediaKey('photo'),
        );
        if (!result.ok) {
          await this.telegram.sendMessage(chatId, result.message);
          return;
        }

        await this.askPaymentBroadcastButtonText(
          chatId,
          session.productSlug,
          session.text,
          {
            type,
            assetId: result.asset.id,
            key: result.asset.key,
          },
        );
        return;
      }

      const key = this.normalizeMediaAssetKey(text);
      if (!key) {
        await this.telegram.sendMessage(
          chatId,
          `Send a valid ${label} key, or /cancel.`,
          this.getBroadcastTextKeyboardMarkup(),
        );
        return;
      }

      const asset = await this.broadcastMediaAssets.findOne({
        where: { type, key },
      });
      if (!asset) {
        await this.telegram.sendMessage(
          chatId,
          `${this.capitalize(label)} <code>${this.escape(key)}</code> not found. Use <code>${listCommand}</code> or /cancel.`,
          this.getBroadcastTextKeyboardMarkup(),
        );
        return;
      }

      await this.askPaymentBroadcastButtonText(
        chatId,
        session.productSlug,
        session.text,
        {
          type,
          assetId: asset.id,
          key: asset.key,
        },
      );
      return;
    }

    if (session.step === 'paymentButtonText') {
      if (text === PAYMENT_BROADCAST_DEFAULT_BUTTON_TEXT_BUTTON) {
        await this.preparePaymentBroadcastPreview(
          chatId,
          session.productSlug,
          session.text,
          session.media,
        );
        return;
      }

      if (!text || text.startsWith('/')) {
        await this.telegram.sendMessage(
          chatId,
          'Send a non-empty payment button text or cancel the broadcast.',
          this.getPaymentBroadcastButtonTextKeyboardMarkup(),
        );
        return;
      }

      await this.preparePaymentBroadcastPreview(
        chatId,
        session.productSlug,
        session.text,
        session.media,
        text,
      );
      return;
    }

    if (session.step === 'marathonMessage') {
      if (text === MARATHON_DEFAULT_TEXT_BUTTON) {
        await this.askMarathonBroadcastButtonText(
          chatId,
          this.flow.getScreenText(MARATHON_BROADCAST_SCREEN_ID),
        );
        return;
      }

      if (!text || text.startsWith('/')) {
        await this.telegram.sendMessage(
          chatId,
          'Send a non-empty marathon broadcast text or cancel the broadcast.',
          this.getMarathonBroadcastTextKeyboardMarkup(),
        );
        return;
      }

      await this.askMarathonBroadcastButtonText(chatId, text);
      return;
    }

    if (session.step === 'marathonButtonText') {
      if (text === MARATHON_DEFAULT_BUTTON_TEXT_BUTTON) {
        await this.prepareMarathonBroadcastPreview(chatId, session.text);
        return;
      }

      if (!text || text.startsWith('/')) {
        await this.telegram.sendMessage(
          chatId,
          'Send a non-empty marathon button text or cancel the broadcast.',
          this.getMarathonBroadcastButtonTextKeyboardMarkup(),
        );
        return;
      }

      await this.prepareMarathonBroadcastPreview(chatId, session.text, text);
      return;
    }

    if (session.step === 'message') {
      if (!text || text.startsWith('/')) {
        await this.telegram.sendMessage(
          chatId,
          'Send a non-empty broadcast text or cancel the broadcast.',
          this.getBroadcastTextKeyboardMarkup(),
        );
        return;
      }

      this.broadcastSessions.set(String(chatId), {
        step: 'buttonText',
        text,
      });

      await this.telegram.sendMessage(
        chatId,
        [
          '<b>Broadcast button</b>',
          '',
          `Send button text, or tap ${BROADCAST_SKIP_BUTTON}.`,
          'Example: Купить',
        ].join('\n'),
        this.getBroadcastButtonTextKeyboardMarkup(),
      );
      return;
    }

    if (session.step === 'buttonText') {
      if (text === BROADCAST_SKIP_BUTTON) {
        await this.askBroadcastMediaChoice(chatId, session.text);
        return;
      }

      if (!text || text.startsWith('/')) {
        await this.telegram.sendMessage(
          chatId,
          'Send button text or skip the button.',
          this.getBroadcastButtonTextKeyboardMarkup(),
        );
        return;
      }

      this.broadcastSessions.set(String(chatId), {
        step: 'buttonUrl',
        text: session.text,
        buttonText: text,
      });

      await this.telegram.sendMessage(
        chatId,
        [
          '<b>Broadcast button URL</b>',
          '',
          'Send the button URL.',
          'Example: https://example.com',
        ].join('\n'),
        this.getBroadcastTextKeyboardMarkup(),
      );
      return;
    }

    if (session.step === 'buttonUrl') {
      const buttonUrl = this.normalizeBroadcastButtonUrl(text);
      if (!buttonUrl) {
        await this.telegram.sendMessage(
          chatId,
          'Send a valid http:// or https:// URL for the button.',
          this.getBroadcastTextKeyboardMarkup(),
        );
        return;
      }

      await this.askBroadcastMediaChoice(chatId, session.text, {
        text: session.buttonText,
        url: buttonUrl,
      });
      return;
    }

    if (session.step === 'mediaChoice') {
      if (text === BROADCAST_SKIP_MEDIA_BUTTON) {
        await this.prepareBroadcastPreview(
          chatId,
          session.text,
          session.button,
        );
        return;
      }

      if (
        text !== BROADCAST_VIDEO_NOTE_BUTTON &&
        text !== BROADCAST_PHOTO_BUTTON
      ) {
        await this.telegram.sendMessage(
          chatId,
          'Choose broadcast media or skip it.',
          this.getBroadcastMediaKeyboardMarkup(),
        );
        return;
      }

      const mediaType =
        text === BROADCAST_PHOTO_BUTTON ? 'photo' : 'video_note';
      const label = this.getMediaTypeLabel(mediaType);
      const listCommand = mediaType === 'photo' ? '/photos' : '/video_notes';
      this.broadcastSessions.set(String(chatId), {
        step: mediaType === 'photo' ? 'photoKey' : 'videoNoteKey',
        text: session.text,
        button: session.button,
      });

      await this.telegram.sendMessage(
        chatId,
        [
          `<b>Broadcast ${label}</b>`,
          '',
          mediaType === 'photo'
            ? 'Send a saved photo key or upload a photo now.'
            : `Send saved ${label} key.`,
          `Use <code>${listCommand}</code> to see saved keys.`,
        ].join('\n'),
        this.getBroadcastTextKeyboardMarkup(),
      );
      return;
    }

    if (session.step === 'videoNoteKey' || session.step === 'photoKey') {
      const type = session.step === 'photoKey' ? 'photo' : 'video_note';
      const label = this.getMediaTypeLabel(type);
      const listCommand = type === 'photo' ? '/photos' : '/video_notes';

      if (type === 'photo' && message.photo?.length) {
        const result = await this.saveBroadcastMediaAssetFromMessage(
          message,
          'photo',
          this.buildAutoBroadcastMediaKey('photo'),
        );
        if (!result.ok) {
          await this.telegram.sendMessage(chatId, result.message);
          return;
        }

        await this.prepareBroadcastPreview(
          chatId,
          session.text,
          session.button,
          {
            type,
            assetId: result.asset.id,
            key: result.asset.key,
          },
        );
        return;
      }

      const key = this.normalizeMediaAssetKey(text);
      if (!key) {
        await this.telegram.sendMessage(
          chatId,
          `Send a valid ${label} key, or /cancel.`,
          this.getBroadcastTextKeyboardMarkup(),
        );
        return;
      }

      const asset = await this.broadcastMediaAssets.findOne({
        where: { type, key },
      });
      if (!asset) {
        await this.telegram.sendMessage(
          chatId,
          `${this.capitalize(label)} <code>${this.escape(key)}</code> not found. Use <code>${listCommand}</code> or /cancel.`,
          this.getBroadcastTextKeyboardMarkup(),
        );
        return;
      }

      await this.prepareBroadcastPreview(chatId, session.text, session.button, {
        type,
        assetId: asset.id,
        key: asset.key,
      });
      return;
    }

    if (session.step === 'confirm') {
      if (
        command !== '/confirm_broadcast' &&
        text !== BROADCAST_CONFIRM_BUTTON
      ) {
        await this.telegram.sendMessage(
          chatId,
          'Confirm or cancel the broadcast with the buttons below.',
          this.getBroadcastConfirmKeyboardMarkup(),
        );
        return;
      }

      if (this.broadcastInProgress) {
        this.broadcastSessions.delete(String(chatId));
        await this.telegram.sendMessage(
          chatId,
          'Another broadcast is already running. Try again later.',
          this.getRemoveKeyboardMarkup(),
        );
        return;
      }

      this.broadcastSessions.delete(String(chatId));
      this.broadcastInProgress = true;

      await this.telegram.sendMessage(
        chatId,
        `Broadcast started for ${session.recipientsCount} users.`,
        this.getRemoveKeyboardMarkup(),
      );

      void this.runBroadcast(
        chatId,
        session.text,
        session.button,
        session.media,
        session.recipientsCount,
      ).catch(async (error: unknown) => {
        await this.telegram.sendMessage(
          chatId,
          `Broadcast failed: ${this.escape(error instanceof Error ? error.message : String(error))}`,
          this.getRemoveKeyboardMarkup(),
        );
      });
    }
  }

  private async askBroadcastMediaChoice(
    chatId: string | number,
    text: string,
    button?: BroadcastButton,
  ) {
    this.broadcastSessions.set(String(chatId), {
      step: 'mediaChoice',
      text,
      button,
    });

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Broadcast media</b>',
        '',
        `Choose ${BROADCAST_PHOTO_BUTTON}, ${BROADCAST_VIDEO_NOTE_BUTTON}, or skip media.`,
      ].join('\n'),
      this.getBroadcastMediaKeyboardMarkup(),
    );
  }

  private async prepareBroadcastPreview(
    chatId: string | number,
    text: string,
    button?: BroadcastButton,
    media?: BroadcastMedia,
  ) {
    const recipientsCount = await this.users.count();
    if (recipientsCount === 0) {
      this.broadcastSessions.delete(String(chatId));
      await this.telegram.sendMessage(
        chatId,
        'No users to broadcast to.',
        this.getRemoveKeyboardMarkup(),
      );
      return;
    }

    this.broadcastSessions.set(String(chatId), {
      step: 'confirm',
      text,
      recipientsCount,
      button,
      media,
    });

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Broadcast preview</b>',
        '',
        this.escape(text),
        '',
        ...(button
          ? [
              `Button: ${this.escape(button.text)}`,
              button.url
                ? `URL: ${this.escape(button.url)}`
                : `Callback: <code>${this.escape(button.callbackData ?? '')}</code>`,
              '',
            ]
          : []),
        ...(media
          ? [`Media: ${this.escape(media.key)} (${media.type})`, '']
          : []),
        `Recipients: ${recipientsCount}`,
      ].join('\n'),
      this.getBroadcastInlineButtonMarkup(button),
    );

    await this.telegram.sendMessage(
      chatId,
      `Tap ${BROADCAST_CONFIRM_BUTTON} to start or ${BROADCAST_CANCEL_BUTTON} to cancel.`,
      this.getBroadcastConfirmKeyboardMarkup(),
    );
  }

  private async runBroadcast(
    chatId: string | number,
    text: string,
    button?: BroadcastButton,
    media?: BroadcastMedia,
    recipientsCount = 0,
  ) {
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let offset = 0;
    const escapedText = this.escape(text);
    const replyMarkup = this.getBroadcastInlineButtonMarkup(button);
    const mediaAsset = media
      ? await this.broadcastMediaAssets.findOne({
          where: { id: media.assetId },
        })
      : null;
    const broadcast = await this.broadcastCampaigns.save(
      this.broadcastCampaigns.create({
        text,
        buttonText: button?.text ?? null,
        buttonUrl: button?.url ?? null,
        buttonCallbackData: button?.callbackData ?? null,
        mediaType: media?.type ?? null,
        mediaKey: media?.key ?? null,
        createdByTelegramId: String(chatId),
        recipientsCount,
      }),
    );

    try {
      while (true) {
        const users = await this.users.find({
          select: { telegramId: true },
          order: { createdAt: 'ASC' },
          skip: offset,
          take: BROADCAST_BATCH_SIZE,
        });

        if (users.length === 0) {
          break;
        }

        for (const user of users) {
          if (!user.telegramId) {
            skipped += 1;
            continue;
          }

          if (mediaAsset?.type === 'video_note') {
            const videoNoteResponse = await this.mainTelegram.sendVideoNoteFile(
              user.telegramId,
              mediaAsset.fileData,
            );

            const messageId = this.getResponseMessageId(videoNoteResponse);
            if (videoNoteResponse.ok && messageId) {
              sent += 1;
              await this.saveBroadcastDelivery(
                broadcast.id,
                user.telegramId,
                messageId,
                'video_note',
              );
            } else {
              failed += 1;
            }

            await this.sleep(BROADCAST_SEND_DELAY_MS);
          }

          if (mediaAsset?.type === 'photo') {
            const photoResponse = await this.mainTelegram.sendPhotoBuffer(
              user.telegramId,
              mediaAsset.fileData,
            );

            const messageId = this.getResponseMessageId(photoResponse);
            if (photoResponse.ok && messageId) {
              sent += 1;
              await this.saveBroadcastDelivery(
                broadcast.id,
                user.telegramId,
                messageId,
                'photo',
              );
            } else {
              failed += 1;
            }

            await this.sleep(BROADCAST_SEND_DELAY_MS);
          }

          const response = (await this.mainTelegram.sendMessage(
            user.telegramId,
            escapedText,
            replyMarkup,
          )) as { ok: boolean; result?: { message_id?: number } };

          const messageId = this.getResponseMessageId(response);
          if (response.ok && messageId) {
            sent += 1;
            await this.saveBroadcastDelivery(
              broadcast.id,
              user.telegramId,
              messageId,
              'text',
            );
          } else {
            failed += 1;
          }

          await this.sleep(BROADCAST_SEND_DELAY_MS);
        }

        offset += users.length;
      }

      broadcast.sentCount = sent;
      broadcast.failedCount = failed;
      broadcast.skippedCount = skipped;
      await this.broadcastCampaigns.save(broadcast);

      await this.telegram.sendMessage(
        chatId,
        [
          '✅ <b>Broadcast finished</b>',
          '',
          `ID: <code>${this.escape(broadcast.id)}</code>`,
          `Sent: ${sent}`,
          `Failed: ${failed}`,
          `Skipped: ${skipped}`,
          '',
          `Delete: <code>/delete_broadcast ${this.escape(broadcast.id)}</code>`,
        ].join('\n'),
      );
    } finally {
      this.broadcastInProgress = false;
    }
  }

  private getResponseMessageId(response: { result?: unknown }) {
    const result = response.result as { message_id?: unknown } | undefined;
    return typeof result?.message_id === 'number' && result.message_id > 0
      ? result.message_id
      : null;
  }

  private async saveBroadcastDelivery(
    broadcastId: string,
    telegramId: string,
    messageId: number,
    messageType: BroadcastDelivery['messageType'],
  ) {
    await this.broadcastDeliveries.save(
      this.broadcastDeliveries.create({
        broadcastId,
        telegramId,
        messageId,
        messageType,
      }),
    );
  }

  private async sendBroadcasts(chatId: string | number) {
    const broadcasts = await this.broadcastCampaigns.find({
      order: { createdAt: 'DESC' },
      take: 10,
    });

    if (broadcasts.length === 0) {
      await this.telegram.sendMessage(chatId, 'No broadcasts yet.');
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Recent broadcasts</b>',
        '',
        ...broadcasts.map((broadcast, index) =>
          [
            `${index + 1}. <code>${this.escape(broadcast.id)}</code>`,
            `Created: ${this.formatDate(broadcast.createdAt)}`,
            `Sent messages: ${broadcast.sentCount}`,
            `Failed: ${broadcast.failedCount}`,
            broadcast.deleteRequestedAt
              ? `Deleted: ${broadcast.deletedCount}, delete failed: ${broadcast.deleteFailedCount}`
              : 'Delete status: not requested',
            broadcast.mediaType
              ? `Media: ${this.escape(broadcast.mediaKey ?? broadcast.mediaType)} (${this.escape(broadcast.mediaType)})`
              : 'Media: -',
            `Text: ${this.escape(this.truncate(broadcast.text, 120))}`,
            `Delete: <code>/delete_broadcast ${this.escape(broadcast.id)}</code>`,
          ].join('\n'),
        ),
      ].join('\n\n'),
    );
  }

  private async deleteBroadcast(chatId: string | number, broadcastId?: string) {
    if (!broadcastId) {
      await this.telegram.sendMessage(
        chatId,
        'Usage: <code>/delete_broadcast &lt;broadcast_id&gt;</code>',
      );
      return;
    }

    const broadcast = await this.broadcastCampaigns.findOne({
      where: { id: broadcastId },
    });

    if (!broadcast) {
      await this.telegram.sendMessage(chatId, 'Broadcast not found.');
      return;
    }

    const deliveries = await this.broadcastDeliveries.find({
      where: { broadcastId },
      order: { sentAt: 'ASC' },
    });

    if (deliveries.length === 0) {
      await this.telegram.sendMessage(
        chatId,
        'Broadcast has no saved messages to delete.',
      );
      return;
    }

    let deleted = 0;
    let failed = 0;
    let alreadyDeleted = 0;

    await this.telegram.sendMessage(
      chatId,
      `Deleting ${deliveries.length} broadcast messages...`,
    );

    for (const delivery of deliveries) {
      if (delivery.deletedAt) {
        alreadyDeleted += 1;
        continue;
      }

      const response = await this.mainTelegram.deleteMessage(
        delivery.telegramId,
        delivery.messageId,
      );

      if (response.ok) {
        deleted += 1;
        delivery.deletedAt = new Date();
        delivery.deleteError = null;
      } else {
        failed += 1;
        delivery.deleteError = response.description ?? 'Unknown error';
      }

      await this.broadcastDeliveries.save(delivery);
      await this.sleep(BROADCAST_SEND_DELAY_MS);
    }

    broadcast.deleteRequestedAt = new Date();
    broadcast.deletedCount = alreadyDeleted + deleted;
    broadcast.deleteFailedCount = failed;
    await this.broadcastCampaigns.save(broadcast);

    await this.telegram.sendMessage(
      chatId,
      [
        '✅ <b>Broadcast delete finished</b>',
        '',
        `ID: <code>${this.escape(broadcast.id)}</code>`,
        `Deleted now: ${deleted}`,
        `Already deleted: ${alreadyDeleted}`,
        `Failed: ${failed}`,
      ].join('\n'),
    );
  }

  private async sendSupport(chatId: string | number) {
    const requests = await this.supportRequests.find({
      where: { status: SupportRequestStatus.Open },
      relations: { user: true },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    if (requests.length === 0) {
      await this.telegram.sendMessage(chatId, 'No open support requests.');
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      `<b>Open support requests:</b> ${requests.length}`,
    );

    await Promise.all(
      requests.map((request) =>
        this.sendSupportRequestMessage(chatId, request),
      ),
    );
  }

  private async resolveSupport(
    chatId: string | number,
    requestId?: string,
    messageId?: number,
  ) {
    if (!requestId) {
      await this.telegram.sendMessage(
        chatId,
        'Usage: /resolve_support &lt;request_id&gt;',
      );
      return;
    }

    const request = await this.supportRequests.findOne({
      where: { id: requestId },
      relations: { user: true },
    });

    if (!request) {
      await this.telegram.sendMessage(chatId, 'Support request not found.');
      return;
    }

    if (request.status === SupportRequestStatus.Resolved) {
      await this.telegram.sendMessage(
        chatId,
        'Support request is already resolved.',
      );
      return;
    }

    request.status = SupportRequestStatus.Resolved;
    request.resolvedAt = new Date();
    await this.supportRequests.save(request);

    if (messageId) {
      await this.telegram.editMessageReplyMarkup(chatId, messageId);
    }

    await this.telegram.sendMessage(
      chatId,
      [
        '✅ <b>Support request resolved</b>',
        '',
        `ID: <code>${this.escape(request.id)}</code>`,
        `User: ${this.formatUser(request.user)}`,
        `Telegram ID: <code>${this.escape(request.user.telegramId)}</code>`,
        `Topic: ${this.escape(request.topic)}`,
        ...(request.message
          ? ['', '<b>Message:</b>', this.escape(request.message)]
          : []),
      ].join('\n'),
    );
  }

  private async replySupport(
    chatId: string | number,
    requestId?: string,
    message?: string,
  ) {
    if (!requestId || !message?.trim()) {
      await this.telegram.sendMessage(
        chatId,
        'Usage: /reply_support &lt;request_id&gt; &lt;message&gt;',
      );
      return;
    }

    const request = await this.supportRequests.findOne({
      where: { id: requestId },
      relations: { user: true },
    });

    if (!request) {
      await this.telegram.sendMessage(chatId, 'Support request not found.');
      return;
    }

    await this.sendSupportReply(chatId, request, message.trim());
  }

  private async startSupportReply(chatId: string | number, requestId?: string) {
    if (!requestId) {
      await this.telegram.sendMessage(chatId, 'Support request not found.');
      return;
    }

    const request = await this.supportRequests.findOne({
      where: { id: requestId },
      relations: { user: true },
    });

    if (!request) {
      await this.telegram.sendMessage(chatId, 'Support request not found.');
      return;
    }

    this.grantSubscriptionSessions.delete(String(chatId));
    this.broadcastSessions.delete(String(chatId));
    this.supportReplySessions.set(String(chatId), { requestId });

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Reply to support request</b>',
        '',
        `User: ${this.formatUser(request.user)}`,
        `Telegram ID: <code>${this.escape(request.user.telegramId)}</code>`,
        `Topic: ${this.escape(request.topic)}`,
        '',
        'Send the reply text in the next message.',
        'Use /cancel to cancel.',
      ].join('\n'),
    );
  }

  private async handleSupportReplyStep(
    chatId: string | number,
    text: string,
    session: SupportReplySession,
  ) {
    if (!text) {
      await this.telegram.sendMessage(
        chatId,
        'Send a non-empty support reply or use /cancel.',
      );
      return;
    }

    const request = await this.supportRequests.findOne({
      where: { id: session.requestId },
      relations: { user: true },
    });

    if (!request) {
      this.supportReplySessions.delete(String(chatId));
      await this.telegram.sendMessage(chatId, 'Support request not found.');
      return;
    }

    this.supportReplySessions.delete(String(chatId));
    await this.sendSupportReply(chatId, request, text);
  }

  private async sendSupportReply(
    chatId: string | number,
    request: SupportRequest,
    replyText: string,
  ) {
    const response = await this.mainTelegram.sendMessage(
      request.user.telegramId,
      this.escape(replyText),
    );

    if (!response.ok) {
      await this.telegram.sendMessage(
        chatId,
        `Failed to send reply: ${this.escape(response.description ?? 'Unknown error')}`,
      );
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      [
        '✅ <b>Support reply sent</b>',
        '',
        `ID: <code>${this.escape(request.id)}</code>`,
        `User: ${this.formatUser(request.user)}`,
        `Telegram ID: <code>${this.escape(request.user.telegramId)}</code>`,
        '',
        '<b>Reply:</b>',
        this.escape(replyText),
      ].join('\n'),
    );
  }

  private async sendSupportRequestMessage(
    chatId: string | number,
    request: SupportRequest,
  ) {
    await this.telegram.sendMessage(
      chatId,
      this.formatSupportRequest(request),
      {
        inline_keyboard: [
          [
            {
              text: '↩️ Ответить',
              callback_data: `${REPLY_SUPPORT_PREFIX}${request.id}`,
            },
            {
              text: '✅ Завершить',
              callback_data: `${RESOLVE_SUPPORT_PREFIX}${request.id}`,
            },
          ],
        ],
      },
    );
  }

  private formatSupportRequest(request: SupportRequest) {
    return [
      '💬 <b>Support request</b>',
      '',
      `${this.formatDate(request.createdAt)} - ${this.escape(request.topic)}`,
      `ID: <code>${this.escape(request.id)}</code>`,
      `User: ${this.formatUser(request.user)}`,
      `Telegram ID: <code>${this.escape(request.user.telegramId)}</code>`,
      ...(request.message
        ? ['', '<b>Message:</b>', this.escape(request.message)]
        : []),
      `Reply: <code>/reply_support ${this.escape(request.id)} MESSAGE</code>`,
      `Resolve: <code>/resolve_support ${this.escape(request.id)}</code>`,
    ].join('\n');
  }

  private async findUserOrReply(
    chatId: string | number,
    userReference?: string,
  ) {
    if (!userReference) {
      await this.telegram.sendMessage(
        chatId,
        'Usage: /user &lt;telegram_id_or_username&gt;',
      );
      return null;
    }

    const normalizedTelegramId = this.normalizeTelegramId(userReference);
    const normalizedUsername = this.normalizeUsername(userReference);
    if (!normalizedTelegramId && !normalizedUsername) {
      await this.telegram.sendMessage(
        chatId,
        'Send a numeric Telegram ID or Telegram username, for example: <code>/user 123456789</code> or <code>/user @username</code>.',
      );
      return null;
    }

    const user = normalizedTelegramId
      ? await this.users.findOne({
          where: { telegramId: normalizedTelegramId },
        })
      : await this.findUserByUsername(normalizedUsername as string);
    if (!user) {
      await this.telegram.sendMessage(chatId, 'User not found.');
      return null;
    }

    return user;
  }

  private normalizeTelegramId(value: string) {
    const telegramId = value.trim();

    if (!/^\d+$/.test(telegramId)) {
      return null;
    }

    return BigInt(telegramId) <= 9223372036854775807n ? telegramId : null;
  }

  private async findUserByUsername(username: string) {
    return this.users
      .createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:username)', { username })
      .getOne();
  }

  private normalizeUsername(value: string) {
    const username = value.trim().replace(/^@/, '');

    if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
      return null;
    }

    return username;
  }

  private normalizeMediaAssetKey(value: string) {
    const key = value.trim();

    if (!/^[A-Za-z0-9_-]{2,64}$/.test(key)) {
      return null;
    }

    return key;
  }

  private buildAutoBroadcastMediaKey(type: BroadcastMediaAsset['type']) {
    const random = Math.random().toString(36).slice(2, 8);
    return `broadcast_${type}_${Date.now()}_${random}`;
  }

  private normalizeBroadcastButtonUrl(value: string) {
    const text = value.trim();

    try {
      const url = new URL(text);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
      }

      return url.toString();
    } catch {
      return null;
    }
  }

  private formatPaymentBroadcastProductChoice(product: Product) {
    return `${product.title} (${product.slug}) - ${product.price} ${product.currency}`;
  }

  private findPaymentBroadcastProductChoice(
    value: string,
    products: Product[],
  ) {
    const text = value.trim();
    const slugMatch = text.match(/\(([^)]+)\)/);
    const slug = slugMatch?.[1] ?? text;

    return products.find(
      (product) =>
        product.slug === slug ||
        this.formatPaymentBroadcastProductChoice(product) === text,
    );
  }

  private getDefaultPaymentBroadcastButtonText(product: Product) {
    return `Оплатить ${product.price} ${product.currency}`;
  }

  private getPaymentBroadcastButton(
    product: Product,
    buttonText?: string,
  ): CallbackBroadcastButton {
    return {
      text: buttonText ?? this.getDefaultPaymentBroadcastButtonText(product),
      callbackData: `${PAYMENT_CALLBACK_PREFIX}${product.slug}`,
    };
  }

  private parseSubscriptionEndDate(value: string) {
    const text = value.trim();
    const isoMatch = text.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/,
    );
    const dotMatch = text.match(
      /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/,
    );

    if (isoMatch) {
      return this.buildDate(
        Number(isoMatch[1]),
        Number(isoMatch[2]),
        Number(isoMatch[3]),
        isoMatch[4] ? Number(isoMatch[4]) : 23,
        isoMatch[5] ? Number(isoMatch[5]) : 59,
        !isoMatch[4],
      );
    }

    if (dotMatch) {
      return this.buildDate(
        Number(dotMatch[3]),
        Number(dotMatch[2]),
        Number(dotMatch[1]),
        dotMatch[4] ? Number(dotMatch[4]) : 23,
        dotMatch[5] ? Number(dotMatch[5]) : 59,
        !dotMatch[4],
      );
    }

    return null;
  }

  private buildDate(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    endOfMinute: boolean,
  ) {
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    const date = new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      endOfMinute ? 59 : 0,
      endOfMinute ? 999 : 0,
    );

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute
    ) {
      return null;
    }

    return date;
  }

  private formatUser(user: User) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const username = user.username ? `@${user.username}` : '';
    return this.escape([name, username].filter(Boolean).join(' ') || '-');
  }

  private getMarathonFlowButtonText(product: Product) {
    const flowNumber = this.getMarathonFlowNumber(product);

    if (Number.isFinite(flowNumber)) {
      return `Поток ${flowNumber}`;
    }

    return product.title;
  }

  private getMarathonFlowMenuTitle(productSlug: string) {
    const match = productSlug.match(
      new RegExp(`^${MARATHON_PRODUCT_SLUG_PREFIX}(\\d+)$`),
    );

    return match ? `Марафон №${match[1]}` : 'Марафон';
  }

  private getMarathonFlowNumber(product: Product) {
    const match = product.slug.match(
      new RegExp(`^${MARATHON_PRODUCT_SLUG_PREFIX}(\\d+)$`),
    );

    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  }

  private formatPayload(payload?: Record<string, unknown>) {
    if (!payload) {
      return '';
    }

    const allowedKeys = [
      'text',
      'productSlug',
      'amount',
      'currency',
      'paymentAttemptId',
      'transactionStatus',
      'reasonCode',
    ];

    return allowedKeys
      .filter((key) => payload[key] !== undefined)
      .map((key) => `${key}: ${this.escape(String(payload[key]))}`)
      .join('\n');
  }

  private formatDate(date?: Date) {
    if (!date) {
      return '-';
    }

    return date.toLocaleString('ru-RU', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatBytes(bytes: number) {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  private getMediaTypeLabel(type: BroadcastMediaAsset['type']) {
    return type === 'photo' ? 'photo' : 'video note';
  }

  private capitalize(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private truncate(value: string, maxLength: number) {
    return value.length > maxLength
      ? `${value.slice(0, Math.max(0, maxLength - 3))}...`
      : value;
  }

  private escape(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { TelegramUpdate } from '../bot/telegram.types';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Product } from '../products/product.entity';
import { TelegramApiService } from '../notifications/telegram-api.service';
import { Subscription } from '../subscriptions/subscription.entity';
import { SupportRequest } from '../support/support-request.entity';
import { UserActivityEvent } from '../user-activity/user-activity-event.entity';
import { User } from '../users/user.entity';
import { AdminBotService } from './admin-bot.service';
import { AdminTelegramApiService } from './admin-telegram-api.service';

type BroadcastButton = {
  text: string;
  url: string;
};

type AdminBotServicePrivate = {
  runBroadcast(
    chatId: string | number,
    text: string,
    button?: BroadcastButton,
  ): Promise<void>;
  sleep(ms: number): Promise<void>;
};

function adminMessage(text: string): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 123, first_name: 'Admin' },
      chat: { id: 123, type: 'private' },
      text,
    },
  };
}

function adminCallback(data: string): TelegramUpdate {
  return {
    update_id: 1,
    callback_query: {
      id: 'callback-id',
      from: { id: 123, first_name: 'Admin' },
      message: {
        message_id: 10,
        from: { id: 456, first_name: 'Admin bot', is_bot: true },
        chat: { id: 123, type: 'private' },
      },
      data,
    },
  };
}

function createService() {
  const adminTelegram = {
    sendMessage: jest.fn().mockResolvedValue({ ok: true }),
    answerCallbackQuery: jest.fn().mockResolvedValue({ ok: true }),
    editMessageReplyMarkup: jest.fn().mockResolvedValue({ ok: true }),
  } as unknown as jest.Mocked<AdminTelegramApiService>;
  const mainTelegram = {
    sendMessage: jest.fn().mockResolvedValue({ ok: true }),
  } as unknown as jest.Mocked<TelegramApiService>;
  const config = {
    get: jest.fn((key: string, defaultValue?: string) =>
      key === 'ADMIN_TELEGRAM_IDS' ? '123' : defaultValue,
    ),
  } as unknown as ConfigService;
  const users = {
    count: jest.fn().mockResolvedValue(1),
    find: jest
      .fn()
      .mockResolvedValueOnce([{ telegramId: 'user-chat-id' }])
      .mockResolvedValueOnce([]),
  } as unknown as jest.Mocked<Repository<User>>;
  const supportRequest = {
    id: 'support-request-id',
    topic: 'Оплата',
    createdAt: new Date('2026-07-21T12:00:00.000Z'),
    user: {
      telegramId: 'user-chat-id',
      firstName: 'Client',
    },
  } as SupportRequest;
  const supportRequests = {
    find: jest.fn().mockResolvedValue([supportRequest]),
    findOne: jest.fn().mockResolvedValue(supportRequest),
  } as unknown as jest.Mocked<Repository<SupportRequest>>;

  const service = new AdminBotService(
    adminTelegram,
    mainTelegram,
    config,
    users,
    {} as Repository<Product>,
    {} as Repository<Subscription>,
    {} as Repository<PaymentAttempt>,
    supportRequests,
    {} as Repository<UserActivityEvent>,
  );

  return { service, adminTelegram, mainTelegram, users, supportRequests };
}

describe('AdminBotService', () => {
  it('collects a broadcast URL button before confirmation', async () => {
    const { service, adminTelegram } = createService();
    const privateService = service as unknown as AdminBotServicePrivate;
    const runBroadcast = jest
      .spyOn(privateService, 'runBroadcast')
      .mockResolvedValue(undefined);

    await service.handleUpdate(adminMessage('/broadcast'));
    await service.handleUpdate(adminMessage('Hello <club>'));
    await service.handleUpdate(adminMessage('Купить'));
    await service.handleUpdate(adminMessage('https://example.com/page'));
    await service.handleUpdate(adminMessage('✅ Подтвердить рассылку'));

    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Button: Купить'),
      {
        inline_keyboard: [
          [{ text: 'Купить', url: 'https://example.com/page' }],
        ],
      },
    );
    expect(runBroadcast).toHaveBeenCalledWith(123, 'Hello <club>', {
      text: 'Купить',
      url: 'https://example.com/page',
    });
  });

  it('sends broadcast messages with an inline URL button', async () => {
    const { service, adminTelegram, mainTelegram } = createService();
    const privateService = service as unknown as AdminBotServicePrivate;
    jest.spyOn(privateService, 'sleep').mockResolvedValue(undefined);

    await privateService.runBroadcast(123, 'Hello <club>', {
      text: 'Купить',
      url: 'https://example.com/page',
    });

    expect(mainTelegram.sendMessage).toHaveBeenCalledWith(
      'user-chat-id',
      'Hello &lt;club&gt;',
      {
        inline_keyboard: [
          [{ text: 'Купить', url: 'https://example.com/page' }],
        ],
      },
    );
    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Sent: 1'),
    );
  });

  it('replies to a support request user from the admin bot', async () => {
    const { service, adminTelegram, mainTelegram, supportRequests } =
      createService();

    await service.handleUpdate(
      adminMessage('/reply_support support-request-id Hello <client>'),
    );

    expect(supportRequests.findOne).toHaveBeenCalledWith({
      where: { id: 'support-request-id' },
      relations: { user: true },
    });
    expect(mainTelegram.sendMessage).toHaveBeenCalledWith(
      'user-chat-id',
      'Hello &lt;client&gt;',
    );
    expect(adminTelegram.sendMessage).toHaveBeenLastCalledWith(
      123,
      expect.stringContaining('Support reply sent'),
    );
  });

  it('shows a reply button under support tickets', async () => {
    const { service, adminTelegram } = createService();

    await service.handleUpdate(adminMessage('/support'));

    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Support request'),
      {
        inline_keyboard: [
          [
            {
              text: '↩️ Ответить',
              callback_data: 'support:reply:support-request-id',
            },
            {
              text: '✅ Завершить',
              callback_data: 'support:resolve:support-request-id',
            },
          ],
        ],
      },
    );
  });

  it('starts support reply from a ticket button', async () => {
    const { service, adminTelegram, mainTelegram } = createService();

    await service.handleUpdate(adminCallback('support:reply:support-request-id'));
    await service.handleUpdate(adminMessage('Hello from button'));

    expect(adminTelegram.answerCallbackQuery).toHaveBeenCalledWith(
      'callback-id',
    );
    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Reply to support request'),
    );
    expect(mainTelegram.sendMessage).toHaveBeenCalledWith(
      'user-chat-id',
      'Hello from button',
    );
  });
});

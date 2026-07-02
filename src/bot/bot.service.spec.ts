import { PaymentService } from '../payments/payment.service';
import { ProductService } from '../products/product.service';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { SupportService } from '../support/support.service';
import { UserActivityService } from '../user-activity/user-activity.service';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { TelegramApiService } from '../notifications/telegram-api.service';
import { BotFlowService } from './bot-flow.service';
import { BotService } from './bot.service';

describe('BotService support flow', () => {
  const user = {
    id: 'user-id',
    telegramId: '123456',
  } as User;

  const buildService = () => {
    const telegram = {
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TelegramApiService>;
    const users = {
      upsertTelegramUser: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<UserService>;
    const support = {
      create: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SupportService>;
    const activity = {
      track: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UserActivityService>;
    const flow = new BotFlowService();

    const service = new BotService(
      telegram,
      users,
      {} as ProductService,
      {} as SubscriptionService,
      {} as PaymentService,
      support,
      activity,
      flow,
    );

    return { service, telegram, support, flow };
  };

  it('asks for a message after selecting other support topic', async () => {
    const { service, telegram, support, flow } = buildService();

    await service.handleUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-id',
        from: { id: 123456, first_name: 'Jane' },
        message: {
          message_id: 10,
          chat: { id: 123456, type: 'private' },
        },
        data: 'support:topic:other',
      },
    });

    expect(support.create).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      123456,
      flow.getSupportMessagePrompt(),
    );

    await service.handleUpdate({
      update_id: 2,
      message: {
        message_id: 11,
        from: { id: 123456, first_name: 'Jane' },
        chat: { id: 123456, type: 'private' },
        text: 'Нужно уточнить детали по клубу',
      },
    });

    expect(support.create).toHaveBeenCalledWith(
      user,
      '📝 Другое',
      'Нужно уточнить детали по клубу',
    );
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(
      123456,
      flow.getSupportSuccessMessage(),
    );
  });

  it('creates regular support topics immediately', async () => {
    const { service, telegram, support, flow } = buildService();

    await service.handleUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-id',
        from: { id: 123456, first_name: 'Jane' },
        message: {
          message_id: 10,
          chat: { id: 123456, type: 'private' },
        },
        data: 'support:topic:payment',
      },
    });

    expect(support.create).toHaveBeenCalledWith(
      user,
      '💳 Проблема с оплатой',
    );
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(
      123456,
      flow.getSupportSuccessMessage(),
    );
  });
});

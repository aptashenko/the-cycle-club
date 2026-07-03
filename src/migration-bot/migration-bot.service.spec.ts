import { MIGRATION_BOT_MESSAGE } from './migration-bot.constants';
import { MigrationBotService } from './migration-bot.service';
import { MigrationTelegramApiService } from './migration-telegram-api.service';

describe('MigrationBotService', () => {
  const buildService = () => {
    const telegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MigrationTelegramApiService>;

    return {
      service: new MigrationBotService(telegram),
      telegram,
    };
  };

  it('replies with the migration announcement to any message', async () => {
    const { service, telegram } = buildService();

    await service.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        chat: { id: 123456, type: 'private' },
      },
    });

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      123456,
      MIGRATION_BOT_MESSAGE,
    );
  });

  it('ignores updates without a message', async () => {
    const { service, telegram } = buildService();

    await service.handleUpdate({ update_id: 1 });

    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });
});

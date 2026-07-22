import { TelegramApiService } from '../notifications/telegram-api.service';
import { InviteLinksService } from './invite-links.service';

describe('InviteLinksService', () => {
  it('creates a single-use Telegram invite link', async () => {
    const telegram = {
      createChatInviteLink: jest.fn().mockResolvedValue({
        ok: true,
        result: {
          invite_link: 'https://t.me/+singleUse',
          member_limit: 1,
        },
      }),
    } as unknown as jest.Mocked<TelegramApiService>;
    const service = new InviteLinksService(telegram);

    const link = await service.createSingleUseInviteLink({
      chatId: '-1001234567890',
      name: 'marathon-4',
      expireInSeconds: 3600,
    });

    expect(telegram.createChatInviteLink).toHaveBeenCalledWith({
      chatId: '-1001234567890',
      name: 'marathon-4',
      memberLimit: 1,
      expireDate: expect.any(Number),
    });
    expect(link).toEqual({
      inviteLink: 'https://t.me/+singleUse',
      memberLimit: 1,
      name: undefined,
      expireDate: undefined,
    });
  });

  it('throws when Telegram does not return an invite link', async () => {
    const telegram = {
      createChatInviteLink: jest.fn().mockResolvedValue({
        ok: false,
        description: 'not enough rights',
      }),
    } as unknown as jest.Mocked<TelegramApiService>;
    const service = new InviteLinksService(telegram);

    await expect(
      service.createSingleUseInviteLink({ chatId: '-1001234567890' }),
    ).rejects.toThrow('not enough rights');
  });
});

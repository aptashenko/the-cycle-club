import { Injectable } from '@nestjs/common';
import {
  CreateChatInviteLinkInput,
  TelegramApiService,
} from '../notifications/telegram-api.service';

export type CreateSingleUseInviteLinkInput = {
  chatId: string | number;
  name?: string;
  expireInSeconds?: number;
};

export type InviteLink = {
  inviteLink: string;
  name?: string;
  expireDate?: number;
  memberLimit?: number;
};

@Injectable()
export class InviteLinksService {
  constructor(private readonly telegram: TelegramApiService) {}

  async createInviteLink(
    input: CreateChatInviteLinkInput,
  ): Promise<InviteLink> {
    const response = await this.telegram.createChatInviteLink(input);

    if (!response.ok || !response.result?.invite_link) {
      throw new Error(response.description ?? 'Telegram invite link failed');
    }

    return this.mapInviteLink(response.result);
  }

  createSingleUseInviteLink(
    input: CreateSingleUseInviteLinkInput,
  ): Promise<InviteLink> {
    return this.createInviteLink({
      chatId: input.chatId,
      name: input.name,
      memberLimit: 1,
      expireDate: input.expireInSeconds
        ? Math.floor(Date.now() / 1000) + input.expireInSeconds
        : undefined,
    });
  }

  private mapInviteLink(link: {
    invite_link: string;
    name?: string;
    expire_date?: number;
    member_limit?: number;
  }): InviteLink {
    return {
      inviteLink: link.invite_link,
      name: link.name,
      expireDate: link.expire_date,
      memberLimit: link.member_limit,
    };
  }
}

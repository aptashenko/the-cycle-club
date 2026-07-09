import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { TelegramAttribution } from './telegram-attribution.entity';

type CreateTelegramAttributionInput = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  landingUrl?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class AttributionService {
  constructor(
    @InjectRepository(TelegramAttribution)
    private readonly attributions: Repository<TelegramAttribution>,
  ) {}

  async createTelegramAttribution(
    input: CreateTelegramAttributionInput,
  ): Promise<TelegramAttribution> {
    const attribution = this.attributions.create({
      id: await this.generateUniqueId(),
      ...input,
    });

    return this.attributions.save(attribution);
  }

  async attachTelegramUser(id: string, user: User): Promise<void> {
    if (!this.isValidTelegramStartPayload(id)) {
      return;
    }

    await this.attributions.update(
      { id },
      {
        userId: user.id,
        telegramId: user.telegramId,
        telegramUsername: user.username,
        startedAt: new Date(),
      },
    );
  }

  isValidTelegramStartPayload(value: string): boolean {
    return /^[A-Za-z0-9_-]{1,64}$/.test(value);
  }

  private async generateUniqueId(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = randomBytes(9).toString('base64url');
      const exists = await this.attributions.exists({ where: { id } });

      if (!exists) {
        return id;
      }
    }

    return randomBytes(12).toString('base64url');
  }
}

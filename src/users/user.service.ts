import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramUser } from '../bot/telegram.types';
import { User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getUsersWithExportData() {
    const users = await this.userRepository
        .createQueryBuilder('client')
        .leftJoinAndSelect('client.subscriptions', 'subscriptions')
        .leftJoinAndSelect('client.telegramAttributions', 'utm')
        .leftJoinAndSelect('client.supportRequests', 'supportRequests')
        .leftJoinAndSelect('subscriptions.product', 'product')
        .select('client')
        .addSelect([
          'product',
          'subscriptions.id',
          'subscriptions.productId',
          'subscriptions.status',
          'subscriptions.startsAt',
          'subscriptions.expiresAt',
          'supportRequests.id',
          'supportRequests.topic',
          'supportRequests.status',
          'utm.utmSource',
          'utm.utmCampaign',
        ])
        .getMany();
    const THE_CYCLE_SLUG = 'the-cycle';
    const theCycleMembersOnly = users
        .filter(user => user.subscriptions
            .some(sub => sub.product?.slug === THE_CYCLE_SLUG));
    const theCycleMembers = theCycleMembersOnly
        .map(({ firstName, lastName, subscriptions, telegramAttributions, supportRequests, languageCode, id, telegramId, updatedAt, ...user }) => ({
      id: telegramId,
      name: `${firstName} ${lastName}`.trim(),
      ...user,
      supportRequests: supportRequests.filter(item => item.status === 'open'),
      subscription: subscriptions.find(sub => sub.product?.slug === THE_CYCLE_SLUG),
      utm: {
        sources: telegramAttributions.map(item => item.utmSource).join(','),
        campaigns: telegramAttributions.map(item => item.utmCampaign).join(',')
      }
    }));
    const allMembers = users.map(({ firstName, lastName, subscriptions, telegramAttributions, supportRequests, languageCode, id, telegramId, updatedAt, ...user }) => ({
      id: telegramId,
      name: `${firstName} ${lastName}`.trim(),
      ...user,
      supportRequests: supportRequests.filter(item => item.status === 'open'),
      subscription: subscriptions.find(sub => sub.product?.slug === THE_CYCLE_SLUG),
      utm: {
        sources: telegramAttributions.map(item => item.utmSource).join(','),
        campaigns: telegramAttributions.map(item => item.utmCampaign).join(',')
      }
    }))
    return {theCycleMembers, allMembers};
  }

  async upsertTelegramUser(from: TelegramUser): Promise<User> {
    const telegramId = String(from.id);
    let user = await this.userRepository.findOne({ where: { telegramId } });

    if (!user) {
      user = this.userRepository.create({ telegramId });
    }

    user.username = from.username;
    user.firstName = from.first_name;
    user.lastName = from.last_name;
    user.languageCode = from.language_code;

    return this.userRepository.save(user);
  }

  findByTelegramId(telegramId: string | number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { telegramId: String(telegramId) },
    });
  }
}

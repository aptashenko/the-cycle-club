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

  async findUsersByPayment(productId: string) {
    const users = await this.userRepository
        .createQueryBuilder('client')
        .leftJoinAndSelect('client.subscriptions', 'subscriptions')
        .leftJoinAndSelect('client.telegramAttributions', 'utm')
        .leftJoinAndSelect('client.supportRequests', 'supportRequests')
        .leftJoinAndSelect('subscriptions.product', 'product')
        .leftJoinAndSelect('client.paymentAttempts', 'payments')
        .select('client')
        .addSelect([
          'payments.id',
          'payments.productId',
          'payments.amount',
          'payments.currency',
          'payments.createdAt',
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

    return users
        .filter(user => user.paymentAttempts
            .some(payment => payment.productId === productId)).map(({ firstName, lastName, subscriptions, telegramAttributions, supportRequests, languageCode, id, telegramId, updatedAt, ...user }) => ({
      id: telegramId,
      name: `${firstName} ${lastName}`.trim(),
      ...user,
      supportRequests: supportRequests.filter(item => item.status === 'open'),
      paymentAttempts: user.paymentAttempts.filter(payment => payment.productId === productId),
      utm: {
        sources: telegramAttributions.map(item => item.utmSource).join(','),
        campaigns: telegramAttributions.map(item => item.utmCampaign).join(',')
      }
    }));
  }

  async findUsersByProduct(slug?: string) {
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
    let filteredUsers = users;
    if (slug) {
      filteredUsers = users
          .filter(user => user.subscriptions
          .some(sub => sub.product?.slug === slug))
    }
    return filteredUsers.map(({ firstName, lastName, subscriptions, telegramAttributions, supportRequests, languageCode, id, telegramId, updatedAt, ...user }) => ({
          id: telegramId,
          name: `${firstName} ${lastName}`.trim(),
          ...user,
          supportRequests: supportRequests.filter(item => item.status === 'open'),
          subscription: subscriptions.find(sub => sub.product?.slug === slug),
          utm: {
            sources: telegramAttributions.map(item => item.utmSource).join(','),
            campaigns: telegramAttributions.map(item => item.utmCampaign).join(',')
          }
        }));
  }

  async getUsersWithExportData() {

    const THE_CYCLE_SLUG = 'the-cycle';
    const MARAPHON_4_ID = 'f308f924-e31b-4099-89cd-ad3b04181f26';
    const theCycleMembers = await this.findUsersByProduct(THE_CYCLE_SLUG);
    const maraphonUsers = await this.findUsersByPayment(MARAPHON_4_ID);
    const allMembers  = await this.findUsersByProduct()

    return {theCycleMembers, allMembers, maraphonUsers};
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

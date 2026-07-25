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
        .innerJoinAndSelect('client.paymentAttempts', 'payments')
        .leftJoinAndSelect('client.telegramAttributions', 'utm')
        .leftJoinAndSelect('client.supportRequests', 'supportRequests')
        .where('payments.productId = :productId', { productId })
        .orderBy('payments.createdAt', 'DESC')
        .getMany();

    return users.map(({ firstName, lastName, subscriptions, telegramAttributions, supportRequests, languageCode, id, telegramId, updatedAt, ...user }) => {
      const paymentAttempts = user.paymentAttempts
          .filter(payment => payment.productId === productId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return {
        id: telegramId,
        name: `${firstName} ${lastName}`.trim(),
        ...user,
        supportRequests: supportRequests.filter(item => item.status === 'open'),
        paymentAttempts,
        utm: {
          sources: telegramAttributions.map(item => item.utmSource).join(','),
          campaigns: telegramAttributions.map(item => item.utmCampaign).join(',')
        }
      };
    }).sort((a, b) =>
        b.paymentAttempts[0].createdAt.getTime() - a.paymentAttempts[0].createdAt.getTime(),
    );
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
        .orderBy('subscriptions.expiresAt', 'ASC')
        .getMany();
    let filteredUsers = users;
    if (slug) {
      filteredUsers = users
          .filter(user => user.subscriptions
          .some(sub => sub.product?.slug === slug))
    }
    return filteredUsers.map(({ firstName, lastName, subscriptions, telegramAttributions, supportRequests, languageCode, id, telegramId, updatedAt, ...user }) => {
          const productSubscriptions = subscriptions
              .filter(sub => !slug || sub.product?.slug === slug)
              .sort((a, b) =>
                  (b.expiresAt?.getTime() ?? 0) - (a.expiresAt?.getTime() ?? 0),
              );

          return {
            id: telegramId,
            name: `${firstName} ${lastName}`.trim(),
            ...user,
            supportRequests: supportRequests.filter(item => item.status === 'open'),
            subscription: productSubscriptions[0],
            utm: {
              sources: telegramAttributions.map(item => item.utmSource).join(','),
              campaigns: telegramAttributions.map(item => item.utmCampaign).join(',')
            }
          };
        }).sort((a, b) =>
            (b.subscription?.expiresAt?.getTime() ?? 0) - (a.subscription?.expiresAt?.getTime() ?? 0),
        );
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

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, MoreThan, Repository } from 'typeorm';
import { ProductType, SubscriptionStatus } from '../common/enums';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';
import { Subscription } from './subscription.entity';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async hasActiveSubscription(userId: string, productId: string) {
    const now = new Date();
    const count = await this.subscriptionRepository.count({
      where: [
        {
          userId,
          productId,
          status: SubscriptionStatus.Active,
          expiresAt: MoreThan(now),
        },
        {
          userId,
          productId,
          status: SubscriptionStatus.Active,
          expiresAt: IsNull(),
        },
      ],
    });

    return count > 0;
  }

  async listActiveForUser(userId: string): Promise<Subscription[]> {
    const now = new Date();

    return this.subscriptionRepository
      .createQueryBuilder('subscription')
      .innerJoinAndSelect('subscription.product', 'product')
      .where('subscription.userId = :userId', { userId })
      .andWhere('subscription.status = :status', {
        status: SubscriptionStatus.Active,
      })
      .andWhere('product.type = :productType', {
        productType: ProductType.Subscription,
      })
      .andWhere(
        '(subscription.expiresAt > :now OR subscription.expiresAt IS NULL)',
        { now },
      )
      .orderBy('subscription.createdAt', 'DESC')
      .getMany();
  }

  async findExpiringForReminder(daysBefore: 5 | 1): Promise<Subscription[]> {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() + daysBefore);
    windowStart.setHours(0, 0, 0, 0);

    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 1);

    const reminderField =
      daysBefore === 5 ? 'reminded5DaysAt' : 'reminded1DayAt';

    return this.subscriptionRepository.find({
      where: {
        status: SubscriptionStatus.Active,
        expiresAt: Between(windowStart, windowEnd),
        [reminderField]: IsNull(),
      },
      relations: { user: true, product: true },
      order: { expiresAt: 'ASC' },
    });
  }

  async findExpiredActive(limit = 100): Promise<Subscription[]> {
    return this.subscriptionRepository
      .createQueryBuilder('subscription')
      .innerJoinAndSelect('subscription.user', 'user')
      .innerJoinAndSelect('subscription.product', 'product')
      .where('subscription.status = :status', {
        status: SubscriptionStatus.Active,
      })
      .andWhere('subscription.expiresAt <= :now', { now: new Date() })
      .andWhere('product.type = :productType', {
        productType: ProductType.Subscription,
      })
      .orderBy('subscription.expiresAt', 'ASC')
      .take(limit)
      .getMany();
  }

  async markExpirationReminderSent(
    subscription: Subscription,
    daysBefore: 5 | 1,
  ): Promise<Subscription> {
    if (daysBefore === 5) {
      subscription.reminded5DaysAt = new Date();
    } else {
      subscription.reminded1DayAt = new Date();
    }

    return this.subscriptionRepository.save(subscription);
  }

  async markExpired(subscription: Subscription): Promise<Subscription> {
    subscription.status = SubscriptionStatus.Expired;
    const saved = await this.subscriptionRepository.save(subscription);
    await this.refreshUserMembershipStatus(subscription.userId);

    return saved;
  }

  async activate(user: User, product: Product): Promise<Subscription> {
    let subscription = await this.subscriptionRepository.findOne({
      where: {
        userId: user.id,
        productId: product.id,
        status: SubscriptionStatus.Active,
      },
      relations: { user: true, product: true },
    });

    if (!subscription) {
      subscription = this.subscriptionRepository.create({
        user,
        userId: user.id,
        product,
        productId: product.id,
      });
    }

    const now = new Date();
    const baseDate =
      subscription.expiresAt && subscription.expiresAt > now
        ? new Date(subscription.expiresAt)
        : now;
    const expiresAt = new Date(baseDate);
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    subscription.status = SubscriptionStatus.Active;
    subscription.startsAt = subscription.startsAt ?? now;
    subscription.expiresAt = expiresAt;
    subscription.reminded5DaysAt = null;
    subscription.reminded1DayAt = null;
    user.membershipStatus = 'active';

    const saved = await this.subscriptionRepository.save(subscription);
    await this.userRepository.save(user);

    return saved;
  }

  private async refreshUserMembershipStatus(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return;
    }

    const now = new Date();
    const activeSubscriptions = await this.subscriptionRepository.count({
      where: [
        {
          userId,
          status: SubscriptionStatus.Active,
          expiresAt: MoreThan(now),
        },
        {
          userId,
          status: SubscriptionStatus.Active,
          expiresAt: IsNull(),
        },
      ],
    });

    user.membershipStatus = activeSubscriptions > 0 ? 'active' : 'none';
    await this.userRepository.save(user);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { SubscriptionStatus } from '../common/enums';
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

    return this.subscriptionRepository.find({
      where: [
        { userId, status: SubscriptionStatus.Active, expiresAt: MoreThan(now) },
        { userId, status: SubscriptionStatus.Active, expiresAt: IsNull() },
      ],
      relations: { product: true },
      order: { createdAt: 'DESC' },
    });
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
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    subscription.status = SubscriptionStatus.Active;
    subscription.startsAt = subscription.startsAt ?? now;
    subscription.expiresAt = expiresAt;
    user.membershipStatus = 'active';

    const saved = await this.subscriptionRepository.save(subscription);
    await this.userRepository.save(user);

    return saved;
  }
}

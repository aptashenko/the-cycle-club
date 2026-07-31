import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { SupportRequest } from '../support/support-request.entity';
import { TelegramAttribution } from '../attribution/telegram-attribution.entity';
import { LiveEventRegistration } from '../live-events/live-event-registration.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint', unique: true })
  telegramId: string;

  @Column({ nullable: true })
  username?: string;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ nullable: true })
  languageCode?: string;

  @Column({ default: 'none' })
  membershipStatus: 'none' | 'active';

  @Column({ name: 'bot_blocked_at', type: 'timestamptz', nullable: true })
  botBlockedAt?: Date | null;

  @Column({ name: 'bot_last_error', type: 'text', nullable: true })
  botLastError?: string | null;

  @OneToMany(() => Subscription, (subscription) => subscription.user)
  subscriptions: Subscription[];

  @OneToMany(() => PaymentAttempt, (paymentAttempt) => paymentAttempt.user)
  paymentAttempts: PaymentAttempt[];

  @OneToMany(() => SupportRequest, (supportRequest) => supportRequest.user)
  supportRequests: SupportRequest[];

  @OneToMany(
    () => TelegramAttribution,
    (telegramAttribution) => telegramAttribution.user,
  )
  telegramAttributions: TelegramAttribution[];

  @OneToMany(() => LiveEventRegistration, (registration) => registration.user)
  liveEventRegistrations: LiveEventRegistration[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

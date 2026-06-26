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

  @OneToMany(() => Subscription, (subscription) => subscription.user)
  subscriptions: Subscription[];

  @OneToMany(() => PaymentAttempt, (paymentAttempt) => paymentAttempt.user)
  paymentAttempts: PaymentAttempt[];

  @OneToMany(() => SupportRequest, (supportRequest) => supportRequest.user)
  supportRequests: SupportRequest[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

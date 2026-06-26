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

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price: string;

  @Column({ default: 'UAH' })
  currency: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Subscription, (subscription) => subscription.product)
  subscriptions: Subscription[];

  @OneToMany(() => PaymentAttempt, (paymentAttempt) => paymentAttempt.product)
  paymentAttempts: PaymentAttempt[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

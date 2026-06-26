import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PaymentAttemptStatus, PaymentProvider } from '../common/enums';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';

@Entity('payment_attempts')
export class PaymentAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.paymentAttempts, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Product, (product) => product.paymentAttempts, {
    nullable: false,
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ default: 'UAH' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentAttemptStatus,
    default: PaymentAttemptStatus.Pending,
  })
  status: PaymentAttemptStatus;

  @Column({
    type: 'enum',
    enum: PaymentProvider,
    default: PaymentProvider.WayForPay,
  })
  provider: PaymentProvider;

  @Column({ name: 'provider_order_id', unique: true })
  providerOrderId: string;

  @Column({ name: 'provider_transaction_id', nullable: true })
  providerTransactionId?: string;

  @Column({ name: 'payment_url', type: 'text' })
  paymentUrl: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt?: Date;

  @Column({ name: 'abandoned_at', type: 'timestamptz', nullable: true })
  abandonedAt?: Date;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload?: Record<string, unknown>;
}

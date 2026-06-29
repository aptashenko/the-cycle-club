import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductType } from '../common/enums';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Subscription } from '../subscriptions/subscription.entity';

export type ProductDownloadFile = {
  title: string;
  url: string;
};

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

  @Column({ default: ProductType.Subscription })
  type: ProductType;

  @Column({ name: 'download_files', type: 'jsonb', nullable: true })
  downloadFiles?: ProductDownloadFile[] | null;

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

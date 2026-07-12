import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('telegram_attributions')
@Index('IDX_telegram_attributions_created_at', ['createdAt'])
@Index('IDX_telegram_attributions_telegram_id', ['telegramId'])
export class TelegramAttribution {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'utm_source', nullable: true })
  utmSource?: string;

  @Column({ name: 'utm_medium', nullable: true })
  utmMedium?: string;

  @Column({ name: 'utm_campaign', nullable: true })
  utmCampaign?: string;

  @Column({ name: 'utm_content', nullable: true })
  utmContent?: string;

  @Column({ name: 'utm_term', nullable: true })
  utmTerm?: string;

  @Column({ nullable: true })
  referrer?: string;

  @Column({ name: 'landing_url', type: 'text', nullable: true })
  landingUrl?: string;

  @Column({ nullable: true })
  ip?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'user_id', nullable: true })
  userId?: string;

  @Column({ name: 'telegram_id', type: 'bigint', nullable: true })
  telegramId?: string;

  @Column({ name: 'telegram_username', nullable: true })
  telegramUsername?: string;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

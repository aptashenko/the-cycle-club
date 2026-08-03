import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BroadcastDelivery } from './broadcast-delivery.entity';

@Entity('broadcast_campaigns')
export class BroadcastCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ name: 'button_text', type: 'text', nullable: true })
  buttonText?: string | null;

  @Column({ name: 'button_url', type: 'text', nullable: true })
  buttonUrl?: string | null;

  @Column({ name: 'button_callback_data', type: 'text', nullable: true })
  buttonCallbackData?: string | null;

  @Column({ name: 'media_type', type: 'varchar', length: 32, nullable: true })
  mediaType?: 'photo' | 'video_note' | null;

  @Column({ name: 'media_key', type: 'text', nullable: true })
  mediaKey?: string | null;

  @Column({ name: 'created_by_telegram_id', type: 'bigint' })
  createdByTelegramId: string;

  @Column({ name: 'recipients_count', type: 'integer', default: 0 })
  recipientsCount: number;

  @Column({ name: 'sent_count', type: 'integer', default: 0 })
  sentCount: number;

  @Column({ name: 'failed_count', type: 'integer', default: 0 })
  failedCount: number;

  @Column({ name: 'skipped_count', type: 'integer', default: 0 })
  skippedCount: number;

  @Column({ name: 'delete_requested_at', type: 'timestamptz', nullable: true })
  deleteRequestedAt?: Date | null;

  @Column({ name: 'deleted_count', type: 'integer', default: 0 })
  deletedCount: number;

  @Column({ name: 'delete_failed_count', type: 'integer', default: 0 })
  deleteFailedCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => BroadcastDelivery, (delivery) => delivery.broadcast)
  deliveries: BroadcastDelivery[];
}

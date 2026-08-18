import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BroadcastCampaign } from './broadcast-campaign.entity';

@Entity('broadcast_deliveries')
export class BroadcastDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'broadcast_id', type: 'uuid' })
  broadcastId: string;

  @ManyToOne(() => BroadcastCampaign, (broadcast) => broadcast.deliveries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'broadcast_id' })
  broadcast: BroadcastCampaign;

  @Column({ name: 'telegram_id', type: 'bigint' })
  telegramId: string;

  @Column({ name: 'message_id', type: 'integer' })
  messageId: number;

  @Column({ name: 'message_type', type: 'varchar', length: 32 })
  messageType: 'text' | 'video_note' | 'photo';

  @CreateDateColumn({ name: 'sent_at' })
  sentAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @Column({ name: 'delete_error', type: 'text', nullable: true })
  deleteError?: string | null;
}

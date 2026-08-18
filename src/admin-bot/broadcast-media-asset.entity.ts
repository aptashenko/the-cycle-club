import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('broadcast_media_assets')
export class BroadcastMediaAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  type: 'video_note' | 'photo';

  @Column({ type: 'varchar', length: 64, unique: true })
  key: string;

  @Column({ name: 'admin_file_id', type: 'text' })
  adminFileId: string;

  @Column({ name: 'file_unique_id', type: 'text', nullable: true })
  fileUniqueId?: string | null;

  @Column({ name: 'file_data', type: 'bytea' })
  fileData: Buffer;

  @Column({ name: 'file_size', type: 'integer', nullable: true })
  fileSize?: number | null;

  @Column({ type: 'integer', nullable: true })
  duration?: number | null;

  @Column({ type: 'integer', nullable: true })
  length?: number | null;

  @Column({ type: 'integer', nullable: true })
  width?: number | null;

  @Column({ type: 'integer', nullable: true })
  height?: number | null;

  @Column({ name: 'created_by_telegram_id', type: 'bigint' })
  createdByTelegramId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LiveEventRegistrationStatus } from '../common/enums';
import { User } from '../users/user.entity';

@Entity('live_event_registrations')
@Index('UQ_live_event_registrations_event_user', ['eventSlug', 'userId'], {
  unique: true,
})
@Index('IDX_live_event_registrations_event_created_at', [
  'eventSlug',
  'createdAt',
])
export class LiveEventRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.liveEventRegistrations, {
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'event_slug' })
  eventSlug: string;

  @Column({ name: 'telegram_id', type: 'bigint' })
  telegramId: string;

  @Column({ name: 'telegram_username', nullable: true })
  telegramUsername?: string;

  @Column({
    type: 'enum',
    enum: LiveEventRegistrationStatus,
    default: LiveEventRegistrationStatus.Registered,
  })
  status: LiveEventRegistrationStatus;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

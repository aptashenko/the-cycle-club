import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SupportRequestStatus } from '../common/enums';
import { User } from '../users/user.entity';

@Entity('support_requests')
export class SupportRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.supportRequests, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  topic: string;

  @Column({
    type: 'enum',
    enum: SupportRequestStatus,
    default: SupportRequestStatus.Open,
  })
  status: SupportRequestStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date;
}

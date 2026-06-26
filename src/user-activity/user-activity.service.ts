import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { UserActivityEvent } from './user-activity-event.entity';

@Injectable()
export class UserActivityService {
  private readonly logger = new Logger(UserActivityService.name);

  constructor(
    @InjectRepository(UserActivityEvent)
    private readonly userActivityRepository: Repository<UserActivityEvent>,
  ) {}

  async track(
    user: User,
    eventType: string,
    eventName: string,
    payload?: Record<string, unknown>,
  ) {
    try {
      await this.userActivityRepository.save(
        this.userActivityRepository.create({
          user,
          userId: user.id,
          telegramId: user.telegramId,
          eventType,
          eventName,
          payload,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to track user activity: ${message}`);
    }
  }
}

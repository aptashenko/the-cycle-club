import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportRequestStatus } from '../common/enums';
import { NotificationService } from '../notifications/notification.service';
import { User } from '../users/user.entity';
import { SupportRequest } from './support-request.entity';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportRequest)
    private readonly supportRequestRepository: Repository<SupportRequest>,
    private readonly notifications: NotificationService,
  ) {}

  async create(
    user: User,
    topic: string,
    message?: string,
  ): Promise<SupportRequest> {
    const request = await this.supportRequestRepository.save(
      this.supportRequestRepository.create({
        user,
        userId: user.id,
        topic,
        message,
        status: SupportRequestStatus.Open,
      }),
    );

    await this.notifications.notifySupportRequest({
      ...request,
      user,
    });

    return request;
  }
}

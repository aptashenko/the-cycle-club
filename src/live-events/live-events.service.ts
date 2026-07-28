import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { LiveEventRegistrationStatus } from '../common/enums';
import { User } from '../users/user.entity';
import { LiveEventRegistration } from './live-event-registration.entity';

export type LiveEventRegistrationResult = {
  registration: LiveEventRegistration;
  created: boolean;
};

@Injectable()
export class LiveEventsService {
  constructor(
    @InjectRepository(LiveEventRegistration)
    private readonly registrations: Repository<LiveEventRegistration>,
  ) {}

  async register(
    user: User,
    eventSlug: string,
  ): Promise<LiveEventRegistrationResult> {
    const existing = await this.registrations.findOne({
      where: { eventSlug, userId: user.id },
    });

    if (existing) {
      return { registration: existing, created: false };
    }

    try {
      const registration = await this.registrations.save(
        this.registrations.create({
          user,
          userId: user.id,
          eventSlug,
          telegramId: user.telegramId,
          telegramUsername: user.username,
          status: LiveEventRegistrationStatus.Registered,
        }),
      );

      return { registration, created: true };
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const registration = await this.registrations.findOneOrFail({
        where: { eventSlug, userId: user.id },
      });

      return { registration, created: false };
    }
  }

  async listRegistrationsForExport(eventSlug: string) {
    const registrations = await this.registrations.find({
      where: { eventSlug },
      relations: {
        user: {
          supportRequests: true,
          telegramAttributions: true,
        },
      },
      order: { createdAt: 'DESC' },
    });

    return registrations.map((registration) => {
      const user = registration.user;

      return {
        id: user.telegramId,
        username: user.username,
        name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
        supportRequests: user.supportRequests.filter(
          (item) => item.status === 'open',
        ),
        status: registration.status,
        createdAt: registration.createdAt,
        userCreatedAt: user.createdAt,
        utm: {
          sources: user.telegramAttributions
            .map((item) => item.utmSource)
            .filter(Boolean)
            .join(','),
          campaigns: user.telegramAttributions
            .map((item) => item.utmCampaign)
            .filter(Boolean)
            .join(','),
        },
      };
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      typeof error.driverError === 'object' &&
      error.driverError !== null &&
      'code' in error.driverError &&
      error.driverError.code === '23505'
    );
  }
}

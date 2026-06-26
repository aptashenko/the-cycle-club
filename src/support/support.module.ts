import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupportRequest } from './support-request.entity';
import { SupportService } from './support.service';

@Module({
  imports: [TypeOrmModule.forFeature([SupportRequest]), NotificationsModule],
  providers: [SupportService],
  exports: [SupportService, TypeOrmModule],
})
export class SupportModule {}

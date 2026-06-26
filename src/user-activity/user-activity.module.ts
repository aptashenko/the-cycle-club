import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserActivityEvent } from './user-activity-event.entity';
import { UserActivityService } from './user-activity.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserActivityEvent])],
  providers: [UserActivityService],
  exports: [UserActivityService],
})
export class UserActivityModule {}

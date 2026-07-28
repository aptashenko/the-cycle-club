import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LiveEventRegistration } from './live-event-registration.entity';
import { LiveEventsService } from './live-events.service';

@Module({
  imports: [TypeOrmModule.forFeature([LiveEventRegistration])],
  providers: [LiveEventsService],
  exports: [LiveEventsService, TypeOrmModule],
})
export class LiveEventsModule {}

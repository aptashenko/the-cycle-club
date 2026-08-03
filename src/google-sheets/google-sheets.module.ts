import { Module } from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service';
import { HttpModule } from '@nestjs/axios';
import { LiveEventsModule } from '../live-events/live-events.module';
import { UsersModule } from '../users/users.module';
import { GoogleSheetsSyncJob } from './google-sheets-sync.job';
@Module({
  providers: [GoogleSheetsService, GoogleSheetsSyncJob],
  imports: [UsersModule, LiveEventsModule, HttpModule],
  exports: [GoogleSheetsService],
  controllers: [],
})
export class GoogleSheetsModule {}

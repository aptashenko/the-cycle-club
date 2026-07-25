import { Module } from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service';
import {HttpModule} from "@nestjs/axios";
import {UsersModule} from "../users/users.module";
import {GoogleSheetsSyncJob} from "./google-sheets-sync.job";
@Module({
  providers: [GoogleSheetsService, GoogleSheetsSyncJob],
  imports: [UsersModule, HttpModule],
  exports: [GoogleSheetsService],
  controllers: []
})
export class GoogleSheetsModule {}

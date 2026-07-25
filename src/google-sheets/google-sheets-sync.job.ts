import {Injectable, OnApplicationBootstrap} from "@nestjs/common";
import {GoogleSheetsService} from "./google-sheets.service";
import {Cron} from "@nestjs/schedule";

@Injectable()
export class GoogleSheetsSyncJob implements OnApplicationBootstrap {
    constructor(private readonly googleSheetsService: GoogleSheetsService) {
    }

    async onApplicationBootstrap() {
        this.googleSheetsService.syncTable().catch((error) => {
            console.error('Google Sheets initial sync failed', error);
        });
    }

    @Cron('0 * * * *')
    async handleCrone() {
        await this.googleSheetsService.syncTable()
    }
}
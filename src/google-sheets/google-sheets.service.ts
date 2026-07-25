import { Injectable } from '@nestjs/common';
import {UserService} from "../users/user.service";
import {HttpService} from "@nestjs/axios";
import {ConfigService} from "@nestjs/config";

@Injectable()
export class GoogleSheetsService {
    private readonly googleSheetsWebhookUrl: string;

    constructor(
        private readonly userService: UserService,
        private readonly httpService: HttpService,
        private readonly configService: ConfigService
    ) {
        this.googleSheetsWebhookUrl = this.configService.getOrThrow<string>(
            'GOOGLE_SHEETS_WEBHOOK_URL',
        );
    }

    private formatDate(date?: Date | string | null) {
        return date ? new Date(date).toLocaleDateString('ru-RU') : '';
    }

    async syncTable() {
        const {theCycleMembers, allMembers, maraphonUsers} = await this.userService.getUsersWithExportData();
        const cycleRows = theCycleMembers.map(user => {
            return [
                user.id,
                user.username || '',
                user.name || '',
                user.membershipStatus === 'active' ? 'yes' : 'no', 
                user.utm.sources || '-',
                user.utm.campaigns || '-',
                user.supportRequests.length || 0,
                this.formatDate(user.createdAt),
                this.formatDate(user.subscription?.startsAt),
                this.formatDate(user.subscription?.expiresAt)

            ]
        })

        const maraphon4Rows = maraphonUsers.map(user => {
            const lastPayment = user.paymentAttempts[0];

            return [
                user.id,
                user.username || '',
                user.name || '',
                user.membershipStatus === 'active' ? 'yes' : 'no',
                user.utm.sources || '-',
                user.utm.campaigns || '-',
                user.supportRequests.length || 0,
                this.formatDate(user.createdAt),
                lastPayment.status,
                this.formatDate(lastPayment.createdAt),
                `${lastPayment.amount} ${lastPayment.currency}`
            ]
        })

        const allRows = allMembers.map(user => {
            return [
                user.id,
                user.username || '',
                user.name || '',
                user.supportRequests.length || 0,
                this.formatDate(user.createdAt)
            ]
        })

        await this.httpService.axiosRef.post(
            this.googleSheetsWebhookUrl,
            {theCycle: cycleRows, all: allRows, maraphon4: maraphon4Rows}
        )
        return {theCycle: cycleRows, all: allRows}
    }
}

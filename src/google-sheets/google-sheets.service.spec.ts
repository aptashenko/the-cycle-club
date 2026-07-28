import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { LiveEventsService } from '../live-events/live-events.service';
import { UserService } from '../users/user.service';
import { GoogleSheetsService } from './google-sheets.service';

describe('GoogleSheetsService', () => {
  let service: GoogleSheetsService;
  let httpService: { axiosRef: { post: jest.Mock } };

  beforeEach(() => {
    const userService = {
      getUsersWithExportData: jest.fn().mockResolvedValue({
        theCycleMembers: [],
        allMembers: [],
        maraphonUsers: [],
      }),
    } as unknown as jest.Mocked<UserService>;
    const liveEventsService = {
      listRegistrationsForExport: jest.fn().mockResolvedValue([
        {
          id: '123456',
          username: 'jane',
          name: 'Jane Doe',
          utm: { sources: 'instagram', campaigns: 'launch' },
          supportRequests: [{ id: 'support-id' }],
          userCreatedAt: new Date('2026-07-20T00:00:00.000Z'),
          status: 'registered',
          createdAt: new Date('2026-07-28T00:00:00.000Z'),
        },
      ]),
    } as unknown as jest.Mocked<LiveEventsService>;
    httpService = {
      axiosRef: {
        post: jest.fn().mockResolvedValue(undefined),
      },
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('https://example.com/webhook'),
    } as unknown as jest.Mocked<ConfigService>;

    service = new GoogleSheetsService(
      userService,
      liveEventsService,
      httpService as unknown as HttpService,
      configService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('exports webinar1 registrations to Google Sheets payload', async () => {
    const result = await service.syncTable();

    expect(httpService.axiosRef.post).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        webinar1: [
          [
            '123456',
            'jane',
            'Jane Doe',
            'instagram',
            'launch',
            1,
            expect.any(String),
            'registered',
            expect.any(String),
          ],
        ],
      }),
    );
    expect(result.webinar1).toHaveLength(1);
  });
});

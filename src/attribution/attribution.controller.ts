import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AttributionService } from './attribution.service';

type TelegramRedirectQuery = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

@Controller('telegram')
export class AttributionController {
  constructor(
    private readonly attribution: AttributionService,
    private readonly config: ConfigService,
  ) {}

  @Get('redirect')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async redirectToTelegram(
    @Query() query: TelegramRedirectQuery,
    @Req() request: Request,
  ): Promise<string> {
    const record = await this.attribution.createTelegramAttribution({
      utmSource: this.normalizeQueryValue(query.utm_source),
      utmMedium: this.normalizeQueryValue(query.utm_medium),
      utmCampaign: this.normalizeQueryValue(query.utm_campaign),
      utmContent: this.normalizeQueryValue(query.utm_content),
      utmTerm: this.normalizeQueryValue(query.utm_term),
      referrer: this.normalizeHeaderValue(request.headers.referer),
      landingUrl: this.buildLandingUrl(request),
      ip: this.getRequestIp(request),
      userAgent: this.normalizeHeaderValue(request.headers['user-agent']),
    });

    return this.renderTelegramRedirect(record.id);
  }

  private renderTelegramRedirect(attributionId: string): string {
    const botUsername = this.config
      .get<string>('TELEGRAM_BOT_USERNAME', 'nicolaeva_club_bot')
      .replace(/^@/, '');
    const telegramUrl = `https://t.me/${encodeURIComponent(
      botUsername,
    )}?start=${encodeURIComponent(attributionId)}`;

    return [
      '<!doctype html>',
      '<html lang="ru">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta http-equiv="refresh" content="0;url=' + telegramUrl + '">',
      '<title>Открываем Telegram</title>',
      '<style>',
      ':root{color-scheme:light;--ink:#1f2933;--muted:#667085;--line:#e6e0d8;--paper:#fffaf4;--accent:#b85c7a;--accent-dark:#8f3454}',
      '*{box-sizing:border-box}',
      'body{margin:0;min-height:100vh;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7efe7;color:var(--ink);display:grid;place-items:center;padding:24px}',
      'main{width:min(520px,100%);background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:32px 28px;box-shadow:0 18px 55px rgba(59,43,32,.12)}',
      '.brand{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:var(--accent-dark);font-weight:700;margin-bottom:22px}',
      'h1{font-size:30px;line-height:1.12;margin:0 0 14px;font-weight:750;letter-spacing:0}',
      'p{font-size:16px;line-height:1.56;margin:0;color:var(--muted)}',
      '.actions{display:flex;margin-top:26px}',
      'a{border-radius:10px;padding:13px 18px;font:inherit;font-weight:700;text-decoration:none;background:var(--accent);color:white}',
      'a:hover{background:var(--accent-dark)}',
      '@media (max-width:480px){body{padding:16px}main{padding:28px 22px;border-radius:14px}h1{font-size:26px}.actions{display:grid}a{text-align:center;width:100%}}',
      '</style>',
      '</head>',
      '<body>',
      '<main>',
      '<div class="brand">Nicolaeva | nutrition</div>',
      '<h1>Открываем Telegram</h1>',
      '<p>Если Telegram не открылся автоматически, нажмите кнопку ниже.</p>',
      '<div class="actions">',
      '<a href="' + telegramUrl + '" rel="noopener">Открыть Telegram</a>',
      '</div>',
      '</main>',
      '</body>',
      '</html>',
    ].join('');
  }

  private normalizeQueryValue(value?: string | string[]): string | undefined {
    const normalized = Array.isArray(value) ? value[0] : value;
    return normalized?.trim() || undefined;
  }

  private normalizeHeaderValue(value?: string | string[]): string | undefined {
    return this.normalizeQueryValue(value);
  }

  private buildLandingUrl(request: Request): string {
    const protocol = this.normalizeHeaderValue(
      request.headers['x-forwarded-proto'],
    )
      ?.split(',')[0]
      .trim();
    const host =
      this.normalizeHeaderValue(request.headers['x-forwarded-host']) ??
      this.normalizeHeaderValue(request.headers.host);

    if (!host) {
      return request.originalUrl;
    }

    return `${protocol || request.protocol}://${host}${request.originalUrl}`;
  }

  private getRequestIp(request: Request): string | undefined {
    const forwardedFor = this.normalizeHeaderValue(
      request.headers['x-forwarded-for'],
    );

    return forwardedFor?.split(',')[0]?.trim() || request.ip || undefined;
  }
}

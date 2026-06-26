# The Cycle Club Bot

MVP Telegram bot for a women's club.

Stack:

- Node.js
- TypeScript
- NestJS
- PostgreSQL
- TypeORM
- Telegram Bot API
- WayForPay integration

## What The Bot Does

The bot presents club products, lets users join `The Cycle`, handles payment attempts, activates subscriptions after payment confirmation, shows active subscriptions, and creates support requests.

Current implemented products:

- `The Cycle` - active product flow
- `Марафон` - placeholder
- `Матеріали` - placeholder

## Local Dev Mode

For local testing, use polling and mock payments:

```env
TELEGRAM_BOT_MODE=polling
PAYMENT_MODE=mock
APP_URL=http://localhost:3000
```

In this mode:

- No Telegram webhook is needed.
- No ngrok is needed.
- No WayForPay account is needed.
- The bot receives Telegram updates through `getUpdates`.
- Payment is confirmed through a Telegram callback button.

## Environment Variables

Create `.env`:

```bash
cp .env.example .env
```

Minimal local `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
DATABASE_URL=postgres://postgres:postgres@localhost:5432/the_cycle_club
DATABASE_MIGRATIONS_RUN=true
TELEGRAM_BOT_MODE=polling
PAYMENT_MODE=mock
APP_URL=http://localhost:3000
ADMIN_TELEGRAM_ID=your_telegram_id
MANAGER_TELEGRAM_ID=your_telegram_id
PORT=3000
```

WayForPay variables can stay empty in `PAYMENT_MODE=mock`:

```env
WAYFORPAY_MERCHANT_ACCOUNT=
WAYFORPAY_SECRET_KEY=
WAYFORPAY_MERCHANT_DOMAIN=
```

## Setup

Install dependencies:

```bash
npm install
```

Create PostgreSQL database:

```bash
createdb the_cycle_club
```

Start the app:

```bash
npm run start:dev
```

Then open Telegram and send:

```text
/start
```

## Client Flow

### 1. Start

User sends:

```text
/start
```

Bot:

- creates or updates the user in `users`;
- sends a welcome message about the expert and women's club;
- shows inline buttons:

```text
🌸 The Cycle
🔥 Марафон
📚 Матеріали
```

Bot also shows the bottom reply keyboard:

```text
🏠 На главную
📦 Мои подписки
💬 Саппорт
```

### 2. Main Menu

`🏠 На главную`

Shows the same welcome message with the three product buttons.

`📦 Мои подписки`

Shows active subscriptions.

If there are no active subscriptions:

```text
У вас пока нет активных подписок.
```

`💬 Саппорт`

Shows support topics:

```text
💳 Проблема с оплатой
📚 Нет доступа к продукту
❓ Вопрос по клубу
⚙️ Техническая проблема
📝 Другое
```

After the user selects a topic:

- a `support_requests` record is created;
- the user receives confirmation;
- the manager receives a Telegram notification with the user's Telegram link and selected topic.

### 3. The Cycle Flow

User clicks:

```text
🌸 The Cycle
```

Bot:

- loads the `The Cycle` product;
- checks whether the user has an active subscription;
- sends product description.

If the user has no active subscription, buttons are:

```text
✨ Присоединиться
📖 Что внутри клуба
```

If the user already has an active subscription, only this button is shown:

```text
📖 Что внутри клуба
```

`📖 Что внутри клуба`

Shows information about what is included in the club.

`✨ Присоединиться`

Starts the payment flow.

### 4. Mock Payment Flow

In local dev mode:

```env
PAYMENT_MODE=mock
```

When the user clicks:

```text
✨ Присоединиться
```

Bot:

- creates a `payment_attempts` record;
- sets status to `pending`;
- sets provider to `mock`;
- sends a Telegram callback button:

```text
💳 Подтвердить тестовую оплату
```

When the user clicks this button:

- the payment attempt becomes `paid`;
- `paid_at` is filled;
- a subscription is created or activated;
- `users.membershipStatus` becomes `active`;
- the user receives a success message;
- the admin receives a payment notification.

After this, the user can open:

```text
📦 Мои подписки
```

and see the active subscription.

### 5. Placeholder Products

`🔥 Марафон`

Returns:

```text
🔥 Марафон скоро будет доступен. Следите за обновлениями ❤️
```

`📚 Матеріали`

Returns:

```text
📚 Матеріали скоро будут доступны. Следите за обновлениями ❤️
```

## Abandoned Payments

The app has a scheduled job that runs every 10 minutes.

It finds `payment_attempts` where:

- status is `pending`;
- created more than 45 minutes ago.

Then it:

- marks them as `abandoned`;
- sends a reminder to the user;
- sends an admin notification.

Reminder text:

```text
Вы начали оформление участия, но оплата не была завершена.

Если возникла проблема — напишите в поддержку.
```

## Database Models

Implemented entities:

- `User`
- `Product`
- `Subscription`
- `PaymentAttempt`
- `SupportRequest`

Main statuses:

```text
Subscription: pending, active, expired, cancelled
PaymentAttempt: pending, paid, failed, abandoned
SupportRequest: open, in_progress, resolved
```

TypeORM migrations are enabled. By default, pending migrations run on application startup when:

```env
DATABASE_MIGRATIONS_RUN=true
```

To run migrations manually:

```bash
npm run migration:run
```

To generate a new migration after changing entities:

```bash
npm run migration:generate -- src/database/migrations/YourMigrationName
```

## Production Telegram Mode

For production, use webhook mode:

```env
TELEGRAM_BOT_MODE=webhook
APP_URL=https://your-domain.com
```

Telegram webhook endpoint:

```text
POST {APP_URL}/bot/telegram/webhook
```

Set webhook:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<APP_URL>/bot/telegram/webhook"
```

Example:

```bash
curl "https://api.telegram.org/bot123456:ABC/setWebhook?url=https://example.com/bot/telegram/webhook"
```

## Admin Telegram Bot

Create a second Telegram bot for admin access and configure:

```env
ADMIN_TELEGRAM_BOT_TOKEN=admin_bot_token
ADMIN_TELEGRAM_IDS=123456,789012
```

Admin webhook endpoint:

```text
POST {APP_URL}/admin-bot/telegram/webhook
```

Set admin webhook:

```bash
curl "https://api.telegram.org/bot<ADMIN_TELEGRAM_BOT_TOKEN>/setWebhook?url=<APP_URL>/admin-bot/telegram/webhook"
```

Available admin commands:

```text
/stats
/support
/user <telegram_id>
/payments <telegram_id>
/subscriptions <telegram_id>
/activity <telegram_id>
```

## Production WayForPay Mode

For real payments:

```env
PAYMENT_MODE=wayforpay
APP_URL=https://your-domain.com
WAYFORPAY_MERCHANT_ACCOUNT=your_account
WAYFORPAY_SECRET_KEY=your_secret
WAYFORPAY_MERCHANT_DOMAIN=your-domain.com
```

WayForPay checkout endpoint:

```text
GET {APP_URL}/payments/wayforpay/checkout/:paymentAttemptId
```

WayForPay webhook endpoint:

```text
POST {APP_URL}/payments/wayforpay/webhook
```

Important:

- Return URL does not activate subscriptions.
- Subscription is activated only after a valid WayForPay webhook.
- Webhook signature is verified before marking payment as `paid`.

After a successful WayForPay webhook:

- payment attempt becomes `paid`;
- subscription becomes `active`;
- user receives a success message;
- admin receives payment notification.

## Useful Commands

Build:

```bash
npm run build
```

Run database migrations:

```bash
npm run migration:run
```

Start dev server:

```bash
npm run start:dev
```

Start production build:

```bash
npm run build
npm run start:prod
```

Deploy with migrations:

```bash
npm run deploy
```

## Notes

For local testing with polling and mock payments, use:

```env
TELEGRAM_BOT_MODE=polling
PAYMENT_MODE=mock
APP_URL=http://localhost:3000
```

In this setup, all client flow can be tested directly in Telegram without a public URL.

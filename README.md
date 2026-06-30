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
CLOSED_GROUP_CHAT_ID=
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

Client flow content is configured in:

```text
src/bot/bot-flow.json
```

The config controls screen text, inline buttons, reply keyboard labels, support topics, payment prompt copy, and subscription messages.

Supported screen button types:

- `target` - opens another configured screen through `flow:<screenId>`.
- `action: "startPayment"` with `productSlug` - starts payment for the product.
- `activeText` - optional button text used when the user already has an active subscription for the screen product.
- `visible` - optional visibility rule: `always`, `activeSubscription`, or `inactiveSubscription`.

Product price/currency and active status are still configured in:

```text
src/products/products.json
```

One-time products can include downloadable files:

```json
"downloadFiles": [
  {
    "title": "Скачать PDF",
    "url": "https://your-domain.com/files/material.pdf"
  }
]
```

After successful payment for a `one_time` product, the bot sends these files as Telegram URL buttons.

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
- sends an admin notification.

## Closed Group Access

Set `CLOSED_GROUP_CHAT_ID` to the closed Telegram group chat ID.

The main bot from `TELEGRAM_BOT_TOKEN` must be added to that group as an admin with permission to ban users.

Every hour, the app finds active subscriptions whose `expires_at` is in the past. For each expired subscription it:

- removes the Telegram user from `CLOSED_GROUP_CHAT_ID`;
- marks the subscription as `expired`;
- updates the user's membership status.
- sends the user a bot message with a renewal button.

The removal uses Telegram's ban/unban flow, so the user is kicked from the group but can join again later after renewal.

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
/resolve_support <request_id>
/user <telegram_id>
/payments <telegram_id>
/subscriptions <telegram_id>
/activity <telegram_id>
```

`/support` sends each open support request as a separate message with a
`✅ Завершить` inline button. The same button is included in new support
notifications. The manual fallback command is:

```text
/resolve_support <request_id>
```

Internal notifications are also sent through the admin bot to
`ADMIN_TELEGRAM_IDS`:

- successful payments;
- abandoned payments;
- new support requests.
- critical application errors.

For support requests, `MANAGER_TELEGRAM_ID` is also included if configured.
Each recipient must start the admin bot once before Telegram allows the bot to
send direct messages.

Critical alerts include unexpected 5xx HTTP/webhook errors, uncaught exceptions,
unhandled promise rejections, and polling failures when polling mode is enabled.

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

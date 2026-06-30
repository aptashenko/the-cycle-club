import { BotFlowService } from './bot-flow.service';

describe('BotFlowService', () => {
  let service: BotFlowService;

  beforeEach(() => {
    service = new BotFlowService();
  });

  it('loads the configured start screen', () => {
    expect(service.getStartScreenId()).toBe('welcome');
    expect(service.getScreenText('welcome').length).toBeGreaterThan(0);
  });

  it('builds callbacks for screen transitions and payment actions', () => {
    const keyboard = service.buildScreenInlineKeyboard('the-cycle', {
      hasActiveSubscription: false,
    });

    expect(keyboard?.[0]?.[0]?.callback_data).toBe('payment:start:the-cycle');
    expect(keyboard?.[1]?.[0]?.callback_data).toBe('flow:the-cycle-inside');
  });

  it('uses active subscription button text when provided', () => {
    const keyboard = service.buildScreenInlineKeyboard('the-cycle', {
      hasActiveSubscription: true,
    });

    expect(keyboard?.[0]?.[0]?.callback_data).toBe('payment:start:the-cycle');
    expect(keyboard?.[0]?.[0]?.text.length).toBeGreaterThan(0);
  });

  it('builds consultation button as manager Telegram link', () => {
    const keyboard = service.buildScreenInlineKeyboard('consultation');

    expect(keyboard?.[0]?.[0]).toEqual({
      text: 'Оставить заявку',
      url: 'https://t.me/assistant_nicolaeva',
    });
  });

  it('resolves support topics from callbacks', () => {
    expect(
      service.getSupportTopicByCallback('support:topic:payment')?.requestTopic,
    ).toBe('💳 Проблема с оплатой');
  });

  it('renders payment success message from config', () => {
    expect(
      service.getPaymentSuccessMessage({ productTitle: 'The Cycle' }),
    ).toContain('The Cycle');
  });

  it('renders non-subscription payment success message from config', () => {
    const message = service.getPaymentSuccessMessage(
      { productTitle: 'Материалы' },
      false,
    );

    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain('подписка');
  });
});

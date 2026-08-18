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

  it('builds callbacks and link keyboard for live event registration', () => {
    const keyboard = service.buildScreenInlineKeyboard('webinar1');

    expect(keyboard?.[0]?.[0]).toEqual({
      text: 'Записаться на эфир',
      callback_data: 'live-event:register:webinar1',
    });
    expect(
      service.getLiveEventSlugFromCallback('live-event:register:webinar1'),
    ).toBe('webinar1');
    expect(service.buildLiveEventLinkInlineKeyboard('webinar1')).toEqual([
      [
        {
          text: 'Перейти в Telegram',
          url: 'https://t.me/+S2XB1Sq_collZjRi',
        },
      ],
    ]);
  });

  it('builds a direct link button for the personal channel', () => {
    const keyboard = service.buildScreenInlineKeyboard('personal-channel');

    expect(keyboard?.[0]?.[0]).toEqual({
      text: 'Перейти',
      url: 'https://t.me/+aCEPu2L_KVo4MjJi',
    });
  });

  it('uses active subscription button text when provided', () => {
    const keyboard = service.buildScreenInlineKeyboard('the-cycle', {
      hasActiveSubscription: true,
    });

    expect(keyboard?.[0]?.[0]?.callback_data).toBe('payment:start:the-cycle');
    expect(keyboard?.[0]?.[0]?.text.length).toBeGreaterThan(0);
  });

  it('shows club link only for active The Cycle subscription', () => {
    const inactiveKeyboard = service.buildScreenInlineKeyboard('the-cycle', {
      hasActiveSubscription: false,
    });
    const activeKeyboard = service.buildScreenInlineKeyboard('the-cycle', {
      hasActiveSubscription: true,
    });

    expect(inactiveKeyboard?.flat().some((button) => button.url)).toBe(false);
    expect(activeKeyboard?.[1]?.[0]).toEqual({
      text: 'Перейти в клуб',
      url: 'https://telegram.me/+idivZ5snYSo1OTUy',
    });
  });

  it('builds consultation format buttons and payment button', () => {
    const keyboard = service.buildScreenInlineKeyboard('consultation');

    expect(keyboard).toHaveLength(5);
    expect(keyboard?.map((row) => row[0])).toEqual([
      {
        text: '⚡️ EXPRESS | 100 €',
        callback_data: 'flow:consultation-format-1',
      },
      {
        text: '🔬 Первичная | 225 €',
        callback_data: 'flow:consultation-format-2',
      },
      {
        text: '🐣 Фертильность | 300 €',
        callback_data: 'flow:consultation-format-3',
      },
      {
        text: '💎 VIP | 420 €',
        callback_data: 'flow:consultation-format-4',
      },
      {
        text: '👩🏻‍💻 Помочь выбрать',
        callback_data: 'flow:consultation-assistant',
      },
    ]);

    expect(
      service.buildScreenInlineKeyboard('consultation-format-1')?.[0]?.[0],
    ).toEqual({
      text: 'Заказать',
      callback_data: 'payment:start:consultation-format-1',
    });
    expect(
      service.buildScreenInlineKeyboard('consultation-assistant')?.[0]?.[0],
    ).toEqual({
      text: 'Связаться с ассистентом',
      url: 'https://telegram.me/assistant_nicolaeva',
    });
  });

  it('renders payment button product price from context', () => {
    const keyboard = service.buildScreenInlineKeyboard('material-1', {
      productsBySlug: {
        'material-1': {
          price: '1499.00',
          currency: 'UAH',
        },
      },
    });

    expect(keyboard?.[0]?.[0]?.text).toBe('Купить (1499.00 UAH)');
  });

  it('uses active text for included material when subscription context is active', () => {
    const keyboard = service.buildScreenInlineKeyboard('material-3', {
      hasActiveSubscription: true,
      productsBySlug: {
        'material-3': {
          price: '799.00',
          currency: 'UAH',
        },
      },
    });

    expect(keyboard?.[0]?.[0]).toMatchObject({
      text: 'Открыть материал',
      callback_data: 'payment:start:material-3',
    });
  });

  it('resolves support topics from callbacks', () => {
    expect(
      service.getSupportTopicByCallback('support:topic:payment')?.requestTopic,
    ).toBe('💳 Проблема с оплатой');
  });

  it('marks other support topic as requiring a message', () => {
    expect(
      service.getSupportTopicByCallback('support:topic:other'),
    ).toMatchObject({
      requestTopic: '📝 Другое',
      requiresMessage: true,
    });
    expect(service.getSupportMessagePrompt().length).toBeGreaterThan(0);
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

  it('renders product title in download message', () => {
    expect(
      service.getDownloadMessage({ productTitle: 'Практичная методичка' }),
    ).toContain('«Практичная методичка»');
  });

  it('loads keyword response message from config', () => {
    expect(service.getKeywordResponseMessage()).toContain(
      'Спасибо, что была вместе с нами на эфире.',
    );
    expect(service.getKeywordResponseDocumentFiles()).toEqual([
      'sekrety_biohaking.pdf',
    ]);
  });
});

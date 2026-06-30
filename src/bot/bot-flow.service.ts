import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BotFlowConfig,
  FlowButton,
  FlowButtonVisibility,
  FlowScreen,
  SupportTopicConfig,
} from './bot-flow.types';

export const FLOW_CALLBACK_PREFIX = 'flow:';
export const PAYMENT_CALLBACK_PREFIX = 'payment:start:';
export const SUPPORT_OPEN_CALLBACK = 'support:open';
export const SUPPORT_TOPIC_CALLBACK_PREFIX = 'support:topic:';

type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

type InlineKeyboard = InlineKeyboardButton[][];

type FlowButtonContext = {
  hasActiveSubscription?: boolean;
};

type RenderValues = Record<string, string | number>;

@Injectable()
export class BotFlowService {
  private readonly config = this.loadConfig();

  getStartScreenId(): string {
    return this.config.startScreen;
  }

  getScreen(screenId: string): FlowScreen {
    const screen = this.config.screens[screenId];

    if (!screen) {
      throw new Error(`Bot flow screen not found: ${screenId}`);
    }

    return screen;
  }

  getScreenText(screenId: string): string {
    return this.getScreen(screenId).text.join('\n');
  }

  buildScreenInlineKeyboard(
    screenId: string,
    context: FlowButtonContext = {},
  ): InlineKeyboard | undefined {
    const buttons = this.getScreen(screenId).buttons;

    if (!buttons || buttons.length === 0) {
      return undefined;
    }

    const keyboard = buttons
      .map((row) =>
        row
          .filter((button) => this.isButtonVisible(button, context))
          .map((button) => this.buildInlineButton(button, context)),
      )
      .filter((row) => row.length > 0);

    return keyboard.length > 0 ? keyboard : undefined;
  }

  buildReplyKeyboard() {
    return {
      keyboard: this.config.replyKeyboard.buttons.map((row) =>
        row.map((text) => ({ text })),
      ),
      resize_keyboard: true,
      is_persistent: true,
    };
  }

  getReplyKeyboardMessage(): string {
    return this.config.replyKeyboard.message;
  }

  buildSupportTopicsInlineKeyboard(): InlineKeyboard {
    return this.config.support.topics.map((topic) => [
      {
        text: topic.text,
        callback_data: `${SUPPORT_TOPIC_CALLBACK_PREFIX}${topic.id}`,
      },
    ]);
  }

  getSupportPrompt(): string {
    return this.config.support.prompt;
  }

  getSupportOpenButtonText(): string {
    return this.config.support.openButtonText;
  }

  getSupportSuccessMessage(): string {
    return this.config.support.successMessage;
  }

  getSupportTopicByCallback(callbackData: string): SupportTopicConfig | null {
    if (!callbackData.startsWith(SUPPORT_TOPIC_CALLBACK_PREFIX)) {
      return null;
    }

    const topicId = callbackData.slice(SUPPORT_TOPIC_CALLBACK_PREFIX.length);

    return (
      this.config.support.topics.find((topic) => topic.id === topicId) ?? null
    );
  }

  getFlowScreenIdFromCallback(callbackData: string): string | null {
    if (!callbackData.startsWith(FLOW_CALLBACK_PREFIX)) {
      return null;
    }

    return callbackData.slice(FLOW_CALLBACK_PREFIX.length);
  }

  getPaymentProductSlugFromCallback(callbackData: string): string | null {
    if (!callbackData.startsWith(PAYMENT_CALLBACK_PREFIX)) {
      return null;
    }

    return callbackData.slice(PAYMENT_CALLBACK_PREFIX.length);
  }

  buildPaymentIntro(
    hasActiveSubscription: boolean,
    values: RenderValues,
    isSubscriptionProduct = true,
  ): string {
    const intro = isSubscriptionProduct
      ? hasActiveSubscription
        ? this.config.payment.activeIntro
        : this.config.payment.inactiveIntro
      : this.config.payment.nonSubscriptionIntro;

    return this.renderLines(intro, values);
  }

  buildPaymentAmountLine(values: RenderValues): string {
    return this.renderLine(this.config.payment.amountLine, values);
  }

  getPaymentButtonText(isMockPayment: boolean): string {
    return isMockPayment
      ? this.config.payment.mockPayButtonText
      : this.config.payment.payButtonText;
  }

  getPaymentSuccessMessage(
    values: RenderValues,
    isSubscriptionProduct = true,
  ): string {
    const lines = isSubscriptionProduct
      ? this.config.payment.successMessage
      : this.config.payment.nonSubscriptionSuccessMessage;

    return this.renderLines(lines, values);
  }

  getDownloadMessage(values: RenderValues): string {
    return this.renderLines(this.config.payment.downloadMessage, values);
  }

  getMockPaymentSuccessMessage(isSubscriptionProduct = true): string {
    return isSubscriptionProduct
      ? this.config.payment.mockSuccessMessage
      : this.config.payment.nonSubscriptionMockSuccessMessage;
  }

  getSubscriptionsTitle(): string {
    return this.config.subscriptions.title;
  }

  getEmptySubscriptionsMessage(): string {
    return this.config.subscriptions.emptyMessage;
  }

  getActiveSubscriptionMessage(values: RenderValues): string {
    return this.renderLines(this.config.subscriptions.activeMessage, values);
  }

  getSubscriptionExpiresAtPrefix(): string {
    return this.config.subscriptions.expiresAtPrefix;
  }

  getSubscriptionNoExpirationMessage(): string {
    return this.config.subscriptions.noExpirationMessage;
  }

  private buildInlineButton(
    button: FlowButton,
    context: FlowButtonContext,
  ): InlineKeyboardButton {
    const text =
      context.hasActiveSubscription && button.activeText
        ? button.activeText
        : button.text;

    if (button.target) {
      return {
        text,
        callback_data: `${FLOW_CALLBACK_PREFIX}${button.target}`,
      };
    }

    if (button.url) {
      return {
        text,
        url: button.url,
      };
    }

    if (button.action === 'startPayment' && button.productSlug) {
      return {
        text,
        callback_data: `${PAYMENT_CALLBACK_PREFIX}${button.productSlug}`,
      };
    }

    if (button.action === 'openSupport') {
      return {
        text,
        callback_data: SUPPORT_OPEN_CALLBACK,
      };
    }

    throw new Error(`Invalid bot flow button: ${JSON.stringify(button)}`);
  }

  private isButtonVisible(
    button: FlowButton,
    context: FlowButtonContext,
  ): boolean {
    const visible = button.visible ?? 'always';

    if (visible === 'activeSubscription') {
      return context.hasActiveSubscription === true;
    }

    if (visible === 'inactiveSubscription') {
      return context.hasActiveSubscription !== true;
    }

    return true;
  }

  private renderLines(lines: string[], values: RenderValues): string {
    return lines.map((line) => this.renderLine(line, values)).join('\n');
  }

  private renderLine(line: string, values: RenderValues): string {
    return line.replace(/\{\{(\w+)}}/g, (match, key: string) => {
      const value = values[key];
      return value === undefined ? match : String(value);
    });
  }

  private loadConfig(): BotFlowConfig {
    const flowPath = join(__dirname, 'bot-flow.json');
    const config = JSON.parse(readFileSync(flowPath, 'utf8')) as unknown;

    return this.parseConfig(config);
  }

  private parseConfig(value: unknown): BotFlowConfig {
    const config = this.assertObject(value, 'bot-flow.json');

    const flowConfig: BotFlowConfig = {
      startScreen: this.assertString(config.startScreen, 'startScreen'),
      screens: this.parseScreens(config.screens),
      replyKeyboard: {
        message: this.assertString(
          this.assertObject(config.replyKeyboard, 'replyKeyboard').message,
          'replyKeyboard.message',
        ),
        buttons: this.parseStringRows(
          this.assertObject(config.replyKeyboard, 'replyKeyboard').buttons,
          'replyKeyboard.buttons',
        ),
      },
      support: this.parseSupport(config.support),
      payment: this.parsePayment(config.payment),
      subscriptions: this.parseSubscriptions(config.subscriptions),
    };

    if (!flowConfig.screens[flowConfig.startScreen]) {
      throw new Error(`Start screen not found: ${flowConfig.startScreen}`);
    }

    this.validateScreenTargets(flowConfig);

    return flowConfig;
  }

  private parseScreens(value: unknown): Record<string, FlowScreen> {
    const screens = this.assertObject(value, 'screens');
    const parsed: Record<string, FlowScreen> = {};

    for (const [screenId, screenValue] of Object.entries(screens)) {
      const screen = this.assertObject(screenValue, `screens.${screenId}`);
      const parsedScreen: FlowScreen = {
        text: this.parseTextLines(screen.text, `screens.${screenId}.text`),
      };

      if (screen.productSlug !== undefined) {
        parsedScreen.productSlug = this.assertString(
          screen.productSlug,
          `screens.${screenId}.productSlug`,
        );
      }

      if (screen.buttons !== undefined) {
        parsedScreen.buttons = this.parseButtonRows(
          screen.buttons,
          `screens.${screenId}.buttons`,
        );
      }

      parsed[screenId] = parsedScreen;
    }

    if (Object.keys(parsed).length === 0) {
      throw new Error('screens must contain at least one screen');
    }

    return parsed;
  }

  private parseButtonRows(value: unknown, path: string): FlowButton[][] {
    if (!Array.isArray(value)) {
      throw new Error(`${path} must be an array`);
    }

    return value.map((row, rowIndex) => {
      if (!Array.isArray(row)) {
        throw new Error(`${path}.${rowIndex} must be an array`);
      }

      return row.map((button, buttonIndex) =>
        this.parseButton(button, `${path}.${rowIndex}.${buttonIndex}`),
      );
    });
  }

  private parseButton(value: unknown, path: string): FlowButton {
    const button = this.assertObject(value, path);
    const parsed: FlowButton = {
      text: this.assertString(button.text, `${path}.text`),
    };

    if (button.activeText !== undefined) {
      parsed.activeText = this.assertString(
        button.activeText,
        `${path}.activeText`,
      );
    }

    if (button.target !== undefined) {
      parsed.target = this.assertString(button.target, `${path}.target`);
    }

    if (button.url !== undefined) {
      parsed.url = this.assertString(button.url, `${path}.url`);
    }

    if (button.action !== undefined) {
      const action = this.assertString(button.action, `${path}.action`);
      if (action !== 'startPayment' && action !== 'openSupport') {
        throw new Error(`${path}.action has unsupported value: ${action}`);
      }
      parsed.action = action;
    }

    if (button.productSlug !== undefined) {
      parsed.productSlug = this.assertString(
        button.productSlug,
        `${path}.productSlug`,
      );
    }

    if (button.visible !== undefined) {
      parsed.visible = this.parseVisibility(button.visible, `${path}.visible`);
    }

    if (!parsed.target && !parsed.url && !parsed.action) {
      throw new Error(`${path} must define target, url, or action`);
    }

    if (parsed.action === 'startPayment' && !parsed.productSlug) {
      throw new Error(`${path}.productSlug is required for startPayment`);
    }

    return parsed;
  }

  private parseVisibility(value: unknown, path: string): FlowButtonVisibility {
    const visibility = this.assertString(value, path);

    if (
      visibility !== 'always' &&
      visibility !== 'activeSubscription' &&
      visibility !== 'inactiveSubscription'
    ) {
      throw new Error(`${path} has unsupported value: ${visibility}`);
    }

    return visibility;
  }

  private parseSupport(value: unknown): BotFlowConfig['support'] {
    const support = this.assertObject(value, 'support');
    const topics = this.assertArray(support.topics, 'support.topics').map(
      (topic, index) => {
        const parsedTopic = this.assertObject(topic, `support.topics.${index}`);

        return {
          id: this.assertString(parsedTopic.id, `support.topics.${index}.id`),
          text: this.assertString(
            parsedTopic.text,
            `support.topics.${index}.text`,
          ),
          requestTopic: this.assertString(
            parsedTopic.requestTopic,
            `support.topics.${index}.requestTopic`,
          ),
        };
      },
    );

    return {
      prompt: this.assertString(support.prompt, 'support.prompt'),
      openButtonText: this.assertString(
        support.openButtonText,
        'support.openButtonText',
      ),
      successMessage: this.assertString(
        support.successMessage,
        'support.successMessage',
      ),
      topics,
    };
  }

  private parsePayment(value: unknown): BotFlowConfig['payment'] {
    const payment = this.assertObject(value, 'payment');

    return {
      activeIntro: this.parseStringArray(
        payment.activeIntro,
        'payment.activeIntro',
      ),
      inactiveIntro: this.parseStringArray(
        payment.inactiveIntro,
        'payment.inactiveIntro',
      ),
      nonSubscriptionIntro: this.parseStringArray(
        payment.nonSubscriptionIntro,
        'payment.nonSubscriptionIntro',
      ),
      amountLine: this.assertString(payment.amountLine, 'payment.amountLine'),
      payButtonText: this.assertString(
        payment.payButtonText,
        'payment.payButtonText',
      ),
      mockPayButtonText: this.assertString(
        payment.mockPayButtonText,
        'payment.mockPayButtonText',
      ),
      successMessage: this.parseTextLines(
        payment.successMessage,
        'payment.successMessage',
      ),
      nonSubscriptionSuccessMessage: this.parseTextLines(
        payment.nonSubscriptionSuccessMessage,
        'payment.nonSubscriptionSuccessMessage',
      ),
      downloadMessage: this.parseTextLines(
        payment.downloadMessage,
        'payment.downloadMessage',
      ),
      nonSubscriptionMockSuccessMessage: this.assertString(
        payment.nonSubscriptionMockSuccessMessage,
        'payment.nonSubscriptionMockSuccessMessage',
      ),
      mockSuccessMessage: this.assertString(
        payment.mockSuccessMessage,
        'payment.mockSuccessMessage',
      ),
    };
  }

  private parseSubscriptions(value: unknown): BotFlowConfig['subscriptions'] {
    const subscriptions = this.assertObject(value, 'subscriptions');

    return {
      title: this.assertString(subscriptions.title, 'subscriptions.title'),
      emptyMessage: this.assertString(
        subscriptions.emptyMessage,
        'subscriptions.emptyMessage',
      ),
      activeMessage: this.parseTextLines(
        subscriptions.activeMessage,
        'subscriptions.activeMessage',
      ),
      expiresAtPrefix: this.assertString(
        subscriptions.expiresAtPrefix,
        'subscriptions.expiresAtPrefix',
      ),
      noExpirationMessage: this.assertString(
        subscriptions.noExpirationMessage,
        'subscriptions.noExpirationMessage',
      ),
    };
  }

  private validateScreenTargets(config: BotFlowConfig) {
    for (const [screenId, screen] of Object.entries(config.screens)) {
      for (const [rowIndex, row] of (screen.buttons ?? []).entries()) {
        for (const [buttonIndex, button] of row.entries()) {
          if (button.target && !config.screens[button.target]) {
            throw new Error(
              `screens.${screenId}.buttons.${rowIndex}.${buttonIndex}.target not found: ${button.target}`,
            );
          }
        }
      }
    }
  }

  private parseStringRows(value: unknown, path: string): string[][] {
    if (!Array.isArray(value)) {
      throw new Error(`${path} must be an array`);
    }

    return value.map((row, rowIndex) =>
      this.parseStringArray(row, `${path}.${rowIndex}`),
    );
  }

  private parseStringArray(value: unknown, path: string): string[] {
    if (!Array.isArray(value)) {
      throw new Error(`${path} must be an array`);
    }

    return value.map((item, index) =>
      this.assertString(item, `${path}.${index}`),
    );
  }

  private parseTextLines(value: unknown, path: string): string[] {
    if (!Array.isArray(value)) {
      throw new Error(`${path} must be an array`);
    }

    return value.map((item, index) => {
      if (typeof item !== 'string') {
        throw new Error(`${path}.${index} must be a string`);
      }

      return item;
    });
  }

  private assertArray(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) {
      throw new Error(`${path} must be an array`);
    }

    return value;
  }

  private assertObject(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${path} must be an object`);
    }

    return value as Record<string, unknown>;
  }

  private assertString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${path} must be a non-empty string`);
    }

    return value;
  }
}

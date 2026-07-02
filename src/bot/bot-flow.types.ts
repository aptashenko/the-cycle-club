export type FlowButtonVisibility =
  | 'always'
  | 'activeSubscription'
  | 'inactiveSubscription';

export type FlowButton = {
  text: string;
  activeText?: string;
  target?: string;
  url?: string;
  action?: 'startPayment' | 'openSupport';
  productSlug?: string;
  visible?: FlowButtonVisibility;
};

export type FlowScreen = {
  text: string[];
  productSlug?: string;
  photoFile?: string;
  buttons?: FlowButton[][];
};

export type ReplyKeyboardConfig = {
  message: string;
  buttons: string[][];
};

export type SupportTopicConfig = {
  id: string;
  text: string;
  requestTopic: string;
  requiresMessage?: boolean;
};

export type SupportConfig = {
  prompt: string;
  messagePrompt: string;
  openButtonText: string;
  successMessage: string;
  topics: SupportTopicConfig[];
};

export type PaymentConfig = {
  activeIntro: string[];
  inactiveIntro: string[];
  nonSubscriptionIntro: string[];
  amountLine: string;
  payButtonText: string;
  mockPayButtonText: string;
  successMessage: string[];
  nonSubscriptionSuccessMessage: string[];
  downloadMessage: string[];
  nonSubscriptionMockSuccessMessage: string;
  mockSuccessMessage: string;
};

export type SubscriptionsConfig = {
  title: string;
  emptyMessage: string;
  activeMessage: string[];
  expiresAtPrefix: string;
  noExpirationMessage: string;
};

export type BotFlowConfig = {
  startScreen: string;
  screens: Record<string, FlowScreen>;
  replyKeyboard: ReplyKeyboardConfig;
  support: SupportConfig;
  payment: PaymentConfig;
  subscriptions: SubscriptionsConfig;
};

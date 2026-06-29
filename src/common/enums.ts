export enum SubscriptionStatus {
  Pending = 'pending',
  Active = 'active',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

export enum PaymentAttemptStatus {
  Pending = 'pending',
  Paid = 'paid',
  Failed = 'failed',
  Abandoned = 'abandoned',
}

export enum PaymentProvider {
  WayForPay = 'wayforpay',
  Mock = 'mock',
}

export enum ProductType {
  Subscription = 'subscription',
  OneTime = 'one_time',
}

export enum SupportRequestStatus {
  Open = 'open',
  InProgress = 'in_progress',
  Resolved = 'resolved',
}

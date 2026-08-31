export const THE_CYCLE_TODAY_OFFER_SLUG = 'the-cycle-today-offer';
export const THE_CYCLE_TODAY_OFFER_START_PAYLOAD = 'the_cycle_today';
export const THE_CYCLE_TODAY_OFFER_TIME_ZONE = 'Europe/Paris';
export const THE_CYCLE_TODAY_OFFER_UNAVAILABLE_MESSAGE =
  'Ссылка будет доступна через месяц.';

export function isTheCycleTodayOfferAvailable(now = new Date()): boolean {
  const day = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    timeZone: THE_CYCLE_TODAY_OFFER_TIME_ZONE,
  }).format(now);

  return Number(day) === 1;
}

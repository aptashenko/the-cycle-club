import {
  isTheCycleTodayOfferAvailable,
  THE_CYCLE_TODAY_OFFER_UNAVAILABLE_MESSAGE,
} from './the-cycle-today-offer';

describe('The Cycle today offer', () => {
  it('is available on the first day of the month in Europe/Paris', () => {
    expect(
      isTheCycleTodayOfferAvailable(new Date('2026-09-01T10:00:00.000Z')),
    ).toBe(true);
  });

  it('is unavailable from the second day of the month in Europe/Paris', () => {
    expect(
      isTheCycleTodayOfferAvailable(new Date('2026-09-01T22:00:00.000Z')),
    ).toBe(false);
    expect(THE_CYCLE_TODAY_OFFER_UNAVAILABLE_MESSAGE).toBe(
      'Ссылка будет доступна через месяц.',
    );
  });
});

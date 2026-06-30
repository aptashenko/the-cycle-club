import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { DataSource, Repository } from 'typeorm';
import { ProductType, SubscriptionStatus } from '../common/enums';
import { Product } from '../products/product.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { User } from '../users/user.entity';
import { buildDataSourceOptions } from './typeorm.config';

const THE_CYCLE_SLUG = 'the-cycle';
const ACCESS_OPEN = 'відкрито';

type CsvRecord = Record<string, string>;

type ImportStats = {
  rows: number;
  usersCreated: number;
  usersUpdated: number;
  subscriptionsCreated: number;
  subscriptionsUpdated: number;
  subscriptionsExpired: number;
  activeCsvSubscriptions: number;
  inactiveCsvSubscriptions: number;
  skippedTelegramIds: number;
  skippedRows: number;
};

type ProductSeed = {
  slug: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  type?: string;
  downloadFiles?: Product['downloadFiles'];
  isActive: boolean;
};

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const csvPathArg = args.find((arg) => !arg.startsWith('--'));

  if (!csvPathArg) {
    throw new Error(
      'CSV path is required. Example: npm run import:clients -- export_69c1666bd2adf824800b1a23_1782806258.csv --dry-run',
    );
  }

  const csvPath = resolve(process.cwd(), csvPathArg);
  if (!existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const records = parseCsvRecords(readFileSync(csvPath, 'utf8'));
  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));

  await dataSource.initialize();

  try {
    await dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const productRepository = manager.getRepository(Product);
      const subscriptionRepository = manager.getRepository(Subscription);
      const product = await ensureTheCycleProduct(productRepository);
      const stats = await importRecords(
        records,
        userRepository,
        subscriptionRepository,
        product,
      );

      printStats(stats, dryRun);

      if (dryRun) {
        throw new DryRunRollback();
      }
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) {
      throw error;
    }
  } finally {
    await dataSource.destroy();
  }
}

async function importRecords(
  records: CsvRecord[],
  userRepository: Repository<User>,
  subscriptionRepository: Repository<Subscription>,
  product: Product,
): Promise<ImportStats> {
  const stats: ImportStats = {
    rows: records.length,
    usersCreated: 0,
    usersUpdated: 0,
    subscriptionsCreated: 0,
    subscriptionsUpdated: 0,
    subscriptionsExpired: 0,
    activeCsvSubscriptions: 0,
    inactiveCsvSubscriptions: 0,
    skippedTelegramIds: 0,
    skippedRows: 0,
  };

  for (const record of records) {
    const telegramId = record.telegram_id?.trim();

    if (!telegramId || !/^\d+$/.test(telegramId)) {
      stats.skippedTelegramIds += 1;
      continue;
    }

    const user = await upsertUser(record, telegramId, userRepository, stats);
    const subscriptionWindow = parseSubscriptionWindow(record);

    if (!subscriptionWindow) {
      stats.inactiveCsvSubscriptions += 1;
      await expirePastActiveSubscriptions(
        user,
        product,
        userRepository,
        subscriptionRepository,
        stats,
      );
      continue;
    }

    const isActiveCsvSubscription =
      isOpenAccess(record) && subscriptionWindow.expiresAt > new Date();

    if (!isActiveCsvSubscription) {
      stats.inactiveCsvSubscriptions += 1;
      await expirePastActiveSubscriptions(
        user,
        product,
        userRepository,
        subscriptionRepository,
        stats,
      );
      continue;
    }

    stats.activeCsvSubscriptions += 1;
    await upsertActiveSubscription(
      user,
      product,
      subscriptionWindow.startsAt,
      subscriptionWindow.expiresAt,
      userRepository,
      subscriptionRepository,
      stats,
    );
  }

  return stats;
}

async function upsertUser(
  record: CsvRecord,
  telegramId: string,
  userRepository: Repository<User>,
  stats: ImportStats,
): Promise<User> {
  let user = await userRepository.findOne({ where: { telegramId } });
  const isNew = !user;

  if (!user) {
    user = userRepository.create({ telegramId });
  }

  const username = emptyToUndefined(record.username);
  if (username) {
    user.username = username;
  }

  const [firstName, lastName] = splitFullName(record.full_name);
  if (firstName) {
    user.firstName = firstName;
  }
  if (lastName) {
    user.lastName = lastName;
  }

  await userRepository.save(user);

  if (isNew) {
    stats.usersCreated += 1;
  } else {
    stats.usersUpdated += 1;
  }

  return user;
}

async function upsertActiveSubscription(
  user: User,
  product: Product,
  startsAt: Date | null,
  expiresAt: Date,
  userRepository: Repository<User>,
  subscriptionRepository: Repository<Subscription>,
  stats: ImportStats,
) {
  let subscription = await subscriptionRepository.findOne({
    where: {
      userId: user.id,
      productId: product.id,
      status: SubscriptionStatus.Active,
    },
  });

  if (!subscription) {
    subscription = subscriptionRepository.create({
      user,
      userId: user.id,
      product,
      productId: product.id,
    });
    stats.subscriptionsCreated += 1;
  } else {
    stats.subscriptionsUpdated += 1;
  }

  subscription.status = SubscriptionStatus.Active;
  subscription.startsAt = startsAt ?? subscription.startsAt ?? new Date();
  subscription.expiresAt = expiresAt;
  subscription.reminded5DaysAt = null;
  subscription.reminded1DayAt = null;

  user.membershipStatus = 'active';
  await subscriptionRepository.save(subscription);
  await userRepository.save(user);
}

async function expirePastActiveSubscriptions(
  user: User,
  product: Product,
  userRepository: Repository<User>,
  subscriptionRepository: Repository<Subscription>,
  stats: ImportStats,
) {
  const now = new Date();
  const subscriptions = await subscriptionRepository.find({
    where: {
      userId: user.id,
      productId: product.id,
      status: SubscriptionStatus.Active,
    },
  });

  for (const subscription of subscriptions) {
    if (!subscription.expiresAt || subscription.expiresAt > now) {
      continue;
    }

    subscription.status = SubscriptionStatus.Expired;
    await subscriptionRepository.save(subscription);
    stats.subscriptionsExpired += 1;
  }

  const activeSubscriptions = await subscriptionRepository
    .createQueryBuilder('subscription')
    .where('subscription.userId = :userId', { userId: user.id })
    .andWhere('subscription.status = :status', {
      status: SubscriptionStatus.Active,
    })
    .andWhere(
      '(subscription.expiresAt > :now OR subscription.expiresAt IS NULL)',
      { now },
    )
    .getCount();

  user.membershipStatus = activeSubscriptions > 0 ? 'active' : 'none';
  await userRepository.save(user);
}

async function ensureTheCycleProduct(
  productRepository: Repository<Product>,
): Promise<Product> {
  const productSeed = loadProductSeeds().find(
    (product) => product.slug === THE_CYCLE_SLUG,
  );

  if (!productSeed) {
    throw new Error(`Product seed not found: ${THE_CYCLE_SLUG}`);
  }

  let product = await productRepository.findOne({
    where: { slug: productSeed.slug },
  });

  if (!product) {
    product = productRepository.create({ slug: productSeed.slug });
  }

  product.title = productSeed.title;
  product.description = productSeed.description;
  product.price = productSeed.price;
  product.currency = productSeed.currency;
  product.type = parseProductType(productSeed.type);
  product.downloadFiles = productSeed.downloadFiles ?? [];
  product.isActive = productSeed.isActive;

  return productRepository.save(product);
}

function loadProductSeeds(): ProductSeed[] {
  const productsPath = join(__dirname, '../products/products.json');
  const productSeeds = JSON.parse(readFileSync(productsPath, 'utf8')) as unknown;

  if (!Array.isArray(productSeeds)) {
    throw new Error('products.json must contain an array');
  }

  return productSeeds as ProductSeed[];
}

function parseProductType(value: string | undefined): ProductType {
  if (value === undefined || value === ProductType.Subscription) {
    return ProductType.Subscription;
  }

  if (value === ProductType.OneTime) {
    return ProductType.OneTime;
  }

  throw new Error(`Invalid product type: ${value}`);
}

function parseCsvRecords(input: string): CsvRecord[] {
  const rows = parseCsv(input);
  const headers = rows.shift();

  if (!headers) {
    return [];
  }

  return rows
    .filter((row) => row.some((value) => value.trim().length > 0))
    .map((row) => {
      const record: CsvRecord = {};

      for (const [index, header] of headers.entries()) {
        record[header] = row[index] ?? '';
      }

      return record;
    });
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (quoted) {
      if (char === '"' && nextChar === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }

      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }

    if (char === ',') {
      row.push(value);
      value = '';
      continue;
    }

    if (char === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    if (char !== '\r') {
      value += char;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function parseSubscriptionWindow(
  record: CsvRecord,
): { startsAt: Date | null; expiresAt: Date } | null {
  const expiresAt = parseDate(record['підписка фініш'], 'endOfDay');
  if (!expiresAt) {
    return null;
  }

  return {
    startsAt: parseDate(record['підписка'], 'exact'),
    expiresAt,
  };
}

function parseDate(
  value: string | undefined,
  mode: 'exact' | 'endOfDay',
): Date | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const isoDateTime = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (isoDateTime) {
    return buildDate(isoDateTime, mode);
  }

  const dayFirstDateTime = normalized.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (dayFirstDateTime) {
    const [, day, month, year, hour, minute, second] = dayFirstDateTime;
    return buildLocalDate(
      Number(year),
      Number(month),
      Number(day),
      hour,
      minute,
      second,
      mode,
    );
  }

  return null;
}

function buildDate(match: RegExpMatchArray, mode: 'exact' | 'endOfDay') {
  const [, year, month, day, hour, minute, second] = match;

  return buildLocalDate(
    Number(year),
    Number(month),
    Number(day),
    hour,
    minute,
    second,
    mode,
  );
}

function buildLocalDate(
  year: number,
  month: number,
  day: number,
  hour: string | undefined,
  minute: string | undefined,
  second: string | undefined,
  mode: 'exact' | 'endOfDay',
): Date {
  if (mode === 'endOfDay' && hour === undefined) {
    return new Date(year, month - 1, day, 23, 59, 59, 999);
  }

  return new Date(
    year,
    month - 1,
    day,
    Number(hour ?? 0),
    Number(minute ?? 0),
    Number(second ?? 0),
  );
}

function isOpenAccess(record: CsvRecord): boolean {
  return record['доступ']?.trim().toLowerCase() === ACCESS_OPEN;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function splitFullName(value: string | undefined): [string?, string?] {
  const parts = value?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (parts.length === 0) {
    return [];
  }

  const [firstName, ...lastName] = parts;
  return [firstName, lastName.join(' ') || undefined];
}

function printStats(stats: ImportStats, dryRun: boolean) {
  console.log(dryRun ? 'Dry run complete. No changes saved.' : 'Import complete.');
  console.table(stats);
}

class DryRunRollback extends Error {}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

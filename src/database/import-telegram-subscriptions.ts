import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { DataSource, Repository } from 'typeorm';
import { ProductType, SubscriptionStatus } from '../common/enums';
import { Product } from '../products/product.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { User } from '../users/user.entity';
import { buildDataSourceOptions } from './typeorm.config';

const DEFAULT_IMPORT_PATH = 'files/telegram_subscriptions_45.json';
const THE_CYCLE_SLUG = 'the-cycle';

type TelegramSubscriptionRecord = {
  telegram_id: string;
  username?: string;
  access_until: string;
  match_source?: string;
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

type ImportStats = {
  rows: number;
  usersCreated: number;
  usersUpdated: number;
  subscriptionsCreated: number;
  subscriptionsUpdated: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  skippedRows: number;
};

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filePathArg =
    args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_IMPORT_PATH;
  const filePath = resolve(process.cwd(), filePathArg);

  if (!existsSync(filePath)) {
    throw new Error(`Import file not found: ${filePath}`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const records = parseRecords(readFileSync(filePath, 'utf8'));
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
  records: TelegramSubscriptionRecord[],
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
    activeSubscriptions: 0,
    expiredSubscriptions: 0,
    skippedRows: 0,
  };
  const now = new Date();

  for (const record of records) {
    const telegramId = record.telegram_id?.trim();
    const expiresAt = parseAccessUntil(record.access_until);

    if (!telegramId || !/^\d+$/.test(telegramId) || !expiresAt) {
      stats.skippedRows += 1;
      continue;
    }

    const user = await upsertUser(record, telegramId, userRepository, stats);
    await upsertSubscription(
      user,
      product,
      expiresAt,
      expiresAt > now,
      userRepository,
      subscriptionRepository,
      stats,
    );
  }

  return stats;
}

async function upsertUser(
  record: TelegramSubscriptionRecord,
  telegramId: string,
  userRepository: Repository<User>,
  stats: ImportStats,
): Promise<User> {
  let user = await userRepository.findOne({ where: { telegramId } });
  const isNew = !user;

  if (!user) {
    user = userRepository.create({ telegramId });
  }

  if (record.username?.trim()) {
    user.username = record.username.trim();
  }

  await userRepository.save(user);

  if (isNew) {
    stats.usersCreated += 1;
  } else {
    stats.usersUpdated += 1;
  }

  return user;
}

async function upsertSubscription(
  user: User,
  product: Product,
  expiresAt: Date,
  isActive: boolean,
  userRepository: Repository<User>,
  subscriptionRepository: Repository<Subscription>,
  stats: ImportStats,
) {
  let subscription = await subscriptionRepository.findOne({
    where: {
      userId: user.id,
      productId: product.id,
    },
    order: { createdAt: 'DESC' },
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

  subscription.status = isActive
    ? SubscriptionStatus.Active
    : SubscriptionStatus.Expired;
  subscription.startsAt = subscription.startsAt ?? new Date();
  subscription.expiresAt = expiresAt;
  subscription.reminded5DaysAt = null;
  subscription.reminded1DayAt = null;
  user.membershipStatus = isActive ? 'active' : 'none';

  await subscriptionRepository.save(subscription);
  await userRepository.save(user);

  if (isActive) {
    stats.activeSubscriptions += 1;
  } else {
    stats.expiredSubscriptions += 1;
  }
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

function parseRecords(input: string): TelegramSubscriptionRecord[] {
  const records = JSON.parse(input) as unknown;

  if (!Array.isArray(records)) {
    throw new Error('Import file must contain a JSON array');
  }

  return records.flatMap((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      console.warn(`Skipped row ${index}: expected object`);
      return [];
    }

    return [record as TelegramSubscriptionRecord];
  });
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

function parseAccessUntil(value: string | undefined): Date | null {
  const match = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  return new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999);
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

import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.config';

async function resetDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();

  try {
    await dataSource.query('DROP SCHEMA IF EXISTS public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}

resetDatabase()
  .then(() => {
    console.log('Database reset complete.');
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

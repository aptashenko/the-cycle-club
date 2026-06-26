import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.config';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run TypeORM migrations');
}

const AppDataSource = new DataSource(buildDataSourceOptions(databaseUrl));

export default AppDataSource;

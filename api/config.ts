import { config as loadEnv } from 'dotenv';

loadEnv();

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';
const adminToken = process.env.ADMIN_TOKEN ?? '';
const databaseUrl = process.env.DATABASE_URL ?? '';

if (!databaseUrl) {
  // eslint-disable-next-line no-console
  console.warn('DATABASE_URL is not set. API will fail to connect to Postgres.');
}

export const apiConfig = {
  port,
  host,
  adminToken,
  databaseUrl
};

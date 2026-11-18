import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

export async function connectDb(uri: string = env.MONGODB_URI): Promise<void> {
  mongoose.set('strictQuery', true);
  mongoose.connection.on('error', (err) => logger.error({ err }, 'mongodb connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('mongodb disconnected'));
  // autoIndex stays on so unique/TTL indexes exist without a separate migration step in this phase.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info('mongodb connected');
}

export const disconnectDb = (): Promise<void> => mongoose.disconnect();

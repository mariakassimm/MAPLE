import type { Express } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Role } from '../src/common/permissions';
import { User } from '../src/modules/users/user.model';
import { hashPassword } from '../src/modules/users/user.service';

export const TEST_PASSWORD = 'Sup3rSecret!pass';
let mongod: MongoMemoryServer;

export async function startTestDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Wait for every model's indexes (unique SKU, order number, idempotency key...) so uniqueness tests are not racy.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

export async function stopTestDb(): Promise<void> {
  await mongoose.disconnect();
  await mongod.stop();
}

export async function clearDb(): Promise<void> {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

export async function createUser(overrides: { name?: string; email?: string; role?: Role; status?: 'active' | 'suspended' } = {}) {
  return User.create({
    name: 'Test User',
    email: 'user@example.com',
    role: 'customer',
    status: 'active',
    ...overrides,
    passwordHash: await hashPassword(TEST_PASSWORD),
  });
}

export async function loginAs(app: Express, email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return { agent, csrf: res.body.data.csrfToken as string };
}

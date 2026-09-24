import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';
import { signAccessToken } from '../lib/jwt.js';

const APP_CLIENT_ID = 'tb-linkedin-app';
const APP_SCOPE = 'app';

export async function loginWithPassword(db: Database, email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    throw new Error('Invalid email or password');
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid email or password');
  }
  const { token, expiresIn } = signAccessToken({
    sub: user.id,
    client_id: APP_CLIENT_ID,
    scope: APP_SCOPE,
  });
  return { accessToken: token, expiresIn, user: { id: user.id, email: user.email, name: user.name } };
}

export async function registerUser(
  db: Database,
  input: { email: string; password: string; name: string },
) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const [user] = await db
    .insert(users)
    .values({ email: input.email, passwordHash, name: input.name, role: 'member' })
    .returning();
  const { token, expiresIn } = signAccessToken({
    sub: user.id,
    client_id: APP_CLIENT_ID,
    scope: APP_SCOPE,
  });
  return { accessToken: token, expiresIn, user: { id: user.id, email: user.email, name: user.name } };
}

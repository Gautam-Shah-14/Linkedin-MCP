import 'dotenv/config';
import bcrypt from 'bcryptjs';

import { db, pool } from './client.js';
import { users } from './schema.js';

async function main() {
  const passwordHash = await bcrypt.hash('dev-password', 10);
  const [user] = await db
    .insert(users)
    .values({
      email: 'dev@tokenburners.local',
      passwordHash,
      name: 'Dev User',
      role: 'admin',
    })
    .returning();
  console.log(JSON.stringify(user, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

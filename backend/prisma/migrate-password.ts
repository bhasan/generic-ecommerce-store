import crypto from 'crypto';
import { PrismaClient } from '../generated/prisma';
import { hashPassword } from '../src/utils/password.util';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const plaintext = process.argv[3];

  if (!email || !plaintext) {
    console.error('Usage: npm run migrate-password <email> <password>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  // Match the new client-side hashing: sha256 first, then bcrypt
  const sha256 = crypto.createHash('sha256').update(plaintext).digest('hex');
  const newHash = await hashPassword(sha256);

  await prisma.user.update({
    where: { email },
    data: { password: newHash },
  });

  console.log(`Password migrated for ${email}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());

import prisma from '../src/config/database';
import { hashPassword } from '../src/utils/password.util';

/**
 * Production seed: creates only an admin user.
 * Credentials from env: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME.
 * Idempotent: if a user with ADMIN_EMAIL already exists, skips creation.
 */
async function seedProd() {
  console.log('🌱 Production seed: admin user only...');

  const email = process.env.ADMIN_EMAIL || 'admin@smoke-station.local';
  const plainPassword = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';

  if (!plainPassword) {
    console.error('❌ ADMIN_PASSWORD is required. Set it in backend/.env or root .env.prod.');
    process.exit(1);
  }

  // Ensure ADMIN role exists (migrations may have already created roles)
  let adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  if (!adminRole) {
    adminRole = await prisma.role.create({ data: { name: 'ADMIN' } });
    console.log('   Created ADMIN role.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const hasAdminRole = await prisma.userRole.findFirst({
      where: { userId: existing.id, roleId: adminRole.id },
    });
    if (hasAdminRole) {
      console.log(`   Admin user already exists: ${email}. Skipping.`);
      process.exit(0);
    }
    await prisma.userRole.create({
      data: { userId: existing.id, roleId: adminRole.id },
    });
    console.log(`   Attached ADMIN role to existing user: ${email}.`);
    process.exit(0);
  }

  const hashedPassword = await hashPassword(plainPassword);
  const admin = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      approved: true,
    },
  });
  await prisma.userRole.create({
    data: { userId: admin.id, roleId: adminRole.id },
  });

  console.log(`   Admin user created: ${email}`);
  console.log('✅ Production seed complete.');
}

seedProd()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

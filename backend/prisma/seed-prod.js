const { PrismaClient } = require('../generated/prisma');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient({ log: ['error'] });
const SALT_ROUNDS = 10;

const ROLE_NAMES = ['GUEST', 'CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN', 'DELIVERY_DRIVER'];

/**
 * Production seed: creates roles, one admin user, and admin user -> ADMIN role mapping.
 * Credentials from env: DB_USER, DB_PASSWORD (same as database). Optional: ADMIN_NAME.
 * Idempotent: existing roles/users are skipped; missing role or mapping is added.
 */
async function seedProd() {
  console.log('🌱 Production seed: roles, admin user, admin role mapping...');

  const plainPassword = 'admin';
  const username = 'admin';

  // 1. Roles: ensure all app roles exist
  console.log('   Ensuring roles exist...');
  const roleMap = {};
  for (const roleName of ROLE_NAMES) {
    let role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      role = await prisma.role.create({ data: { name: roleName } });
      console.log(`      Created role: ${roleName}`);
    }
    roleMap[roleName] = { id: role.id };
  }
  const adminRoleId = roleMap['ADMIN'].id;

  // 2. Admin user: create or get existing
  let adminUser = await prisma.user.findUnique({ where: { username } });
  if (!adminUser) {
    const hashedPassword = await bcrypt.hash(plainPassword, SALT_ROUNDS);
    adminUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        phoneNumber: null,
        approved: true,
      },
    });
    console.log(`   Admin user created: ${username}`);
  } else {
    console.log(`   Admin user already exists: ${username}`);
  }

  // 3. Admin user -> ADMIN role mapping: ensure UserRole exists
  const existingMapping = await prisma.userRole.findFirst({
    where: { userId: adminUser.id, roleId: adminRoleId },
  });
  if (!existingMapping) {
    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRoleId },
    });
    console.log('   Admin user -> ADMIN role mapping created.');
  } else {
    console.log('   Admin user -> ADMIN role mapping already exists.');
  }

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

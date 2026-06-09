/**
 * One-time migration script for deploying the white-label feature to a running prod app.
 *
 * Run BEFORE deploying the new code:
 *   DATABASE_URL="<prod-url>" npx ts-node scripts/migrate-to-white-label.ts
 *
 * Safe to re-run — every section checks for an existing row before creating.
 */
import prisma from '../src/config/database';

async function main() {
  // ── 1. Read existing store settings ──────────────────────────────────────
  const storeRow = await prisma.uiSetting.findUnique({ where: { key: 'store_settings' } });
  const storeValue = (storeRow?.value ?? {}) as Record<string, unknown>;
  const storeName = typeof storeValue.name === 'string' ? storeValue.name : '';
  const storeAddress = typeof storeValue.address === 'string' ? storeValue.address : '';
  console.log(`store_settings: ${storeRow ? 'EXISTS' : 'MISSING'} (name="${storeName}")`);

  // ── 2. Seed payment_settings if missing ───────────────────────────────────
  // Risk: old code defaulted to handle '$SmokeStationX' in-memory when no DB row.
  //       New code defaults to '' — silently breaks CashApp checkout.
  const paymentRow = await prisma.uiSetting.findUnique({ where: { key: 'payment_settings' } });
  if (!paymentRow) {
    console.log('payment_settings: MISSING — seeding with old defaults');
    await prisma.uiSetting.create({
      data: {
        key: 'payment_settings',
        value: {
          cashapp: { enabled: true, handle: '$SmokeStationX' },
          zelle:   { enabled: false, handle: '' },
          venmo:   { enabled: false, handle: '' },
        },
      },
    });
  } else {
    console.log('payment_settings: EXISTS — skipping');
  }

  // ── 3. Seed ordering_constraints if missing ───────────────────────────────
  // Risk: old code defaulted offlineDeliveryZipCodes to ['77083'].
  //       New code defaults to [] — silently drops offline delivery zone fallback.
  const orderingRow = await prisma.uiSetting.findUnique({ where: { key: 'ordering_constraints' } });
  if (!orderingRow) {
    const zipMatch = storeAddress.match(/\b(\d{5})\b/);
    const zip = zipMatch ? zipMatch[1] : '77083';
    console.log(`ordering_constraints: MISSING — seeding with ZIP ${zip}`);
    await prisma.uiSetting.create({
      data: {
        key: 'ordering_constraints',
        value: {
          minimumDeliveryOrder: 35,
          minimumDeliveryOrderEnabled: true,
          deliveryDisabled: false,
          deliveryDisabledMessage: '',
          deliveryRadiusMiles: 5,
          offlineZipFallbackEnabled: true,
          offlineDeliveryZipCodes: [zip],
        },
      },
    });
  } else {
    console.log('ordering_constraints: EXISTS — skipping');
  }

  // ── 4. Bootstrap branding from store_settings ─────────────────────────────
  // The branding key is new — never exists in prod. Pre-populate storeName so the
  // navbar shows the right name immediately after deploy without manual admin input.
  const brandingRow = await prisma.uiSetting.findUnique({ where: { key: 'branding' } });
  if (!brandingRow) {
    console.log(`branding: MISSING — creating with storeName="${storeName}"`);
    await prisma.uiSetting.create({
      data: {
        key: 'branding',
        value: {
          storeName,
          tagline: '',
          logoUrl: '',
          heroImageUrl: '',
          faviconUrls: { '16': '', '32': '', '180': '' },
          palette: 'purple-dark',
          customColors: null,
        },
      },
    });
  } else {
    console.log('branding: EXISTS — skipping');
  }

  console.log('\nMigration complete.');
  console.log('Next: deploy the new code, then visit /website-management to finish white-labelling.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

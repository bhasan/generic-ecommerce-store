# Phase 2 — Catalog: Product → Variant

## Goal
Split the flat `ProductItem` into **Product → ProductVariant** (price & stock on the
variant), replace the three image fields with a `ProductImage` table, and make quantity
options and bulk price-breaks first-class tables. Catalog money → `Decimal`. Build the
**full variant UI** (customer variant selector + admin multi-variant editor).

> Depends on Phase 1. Reseed-based — no backfill (catalog + order/cart items are reseeded).

## Target schema (`backend/prisma/schema.prisma`)
```
Category            // taxonomy ONLY — pricing defaults removed
  id, name, slug?, description?, parentId? -> Category (self tree, onDelete: Restrict)
  sortOrder, timestamps   @@unique([name, parentId])

Product             // catalog identity (not directly sellable)
  id, name, slug @unique, description?
  categoryId -> Category (onDelete: Restrict)
  vipOnly, hidden, cardSize CardSize, sortOrder, timestamps
  images ProductImage[]   variants ProductVariant[]   @@index([categoryId])

ProductImage
  id, productId -> Product (onDelete: Cascade)
  url, role ImageRole (THUMBNAIL|GALLERY), sortOrder   @@index([productId])

ProductVariant      // the sellable unit
  id, productId -> Product (onDelete: Cascade)
  label, sku @unique, pricingMode PricingMode (UNIT|WEIGHT)
  basePrice Decimal(12,2), stock Decimal(12,3) @default(0), stockEnabled,
  isDefault, active, sortOrder, timestamps
  quantityOptions VariantQuantityOption[]   priceBreaks VariantPriceBreak[]
  @@index([productId])

VariantQuantityOption          // replaces allowedQuantities
  id, variantId -> ProductVariant (onDelete: Cascade)
  quantity Decimal(12,3), sortOrder   @@unique([variantId, quantity])

VariantPriceBreak              // replaces quantityDiscounts (absolute unit price)
  id, variantId -> ProductVariant (onDelete: Cascade)
  minQuantity Decimal(12,3), unitPrice Decimal(12,2)   @@unique([variantId, minQuantity])

enum CardSize { STANDARD WIDE TALL LARGE }
enum ImageRole { THUMBNAIL GALLERY }
enum PricingMode { UNIT WEIGHT }
```
**Order/cart item flip (now finalized — tables were empty in Phase 1):**
```
OrderItem  orderId -> orders (Cascade), variantId -> product_variants (Restrict)
           productName, variantLabel (snapshots), unitPrice Decimal(12,2), quantity
           @@index([orderId])  @@index([variantId])
CartItem   userId -> users (Cascade), variantId -> product_variants (Cascade)
           @@unique([userId, variantId])  + updatedAt
```
`Review.productId` stays **product-level**.

**Price-break resolution** (replaces `resolveDiscountedUnitPrice`): unit price = the
`VariantPriceBreak` with the largest `minQuantity <= orderedQty`, else `variant.basePrice`.

## Migration & reseed
Destructive migration (no catalog/order data to preserve): create enums + new tables,
reshape `products`, flip `order_items`/`cart_items` to `variantId`. Update
`backend/prisma/seed.ts` to seed products **with** variants, options, breaks, and
role-tagged images (include at least one UNIT and one WEIGHT product for testing).

## Backend changes
- `services/product.service.ts` — nested `variants[]` + `images[]` create/update
  (transaction); `getAll`/`getById` include variants(+options/breaks) and images ordered
  by `sortOrder`; rework orphaned-image cleanup to walk `product.images`.
- New `services/pricing.ts` — variant-based resolver (single source of truth for server +
  receipts); replaces the resolver currently inside `order.service.ts`.
- `services/order.service.ts` — checkout items use `variantId`; validate qty vs
  `quantityOptions`, stock vs variant `stock`; resolve unit price via `pricing.ts`;
  decrement variant stock; write `OrderItem` with snapshots; reads join variants→products.
- `services/thermalPrinter.service.ts` — receipt reads variant label + product name
  (prefer the stored snapshot).
- `services/category.service.ts` — drop pricing-default create/update + validators.
- Validators (`routes/product.routes.ts`, reuse `quantityDiscount.validator.ts`,
  `routes/order.routes.ts`) — nested variant/option/break validation; checkout
  `items.*.variantId`.

### API contract
- `GET /api/products` item: `{ ...product, images:[{id,url,role,sortOrder}],
  variants:[{id,label,sku,pricingMode,basePrice,stock,stockEnabled,isDefault,active,
  sortOrder, quantityOptions:[{quantity,sortOrder}], priceBreaks:[{minQuantity,unitPrice}]}] }`
- `POST/PUT /api/products` accept the nested shape.
- `POST /api/orders/checkout` items: `{ variantId, quantity }[]`. **Breaking** —
  ships in lockstep with the frontend below.

## Frontend changes (`web/src`)
- `features/products/productsHelpers.js` — pricing/image helpers operate on a selected
  variant (priceBreaks, role-aware images), keeping signatures where possible.
- `features/products/ProductItemPage.jsx` — variant selector (when >1 active);
  price/stock/images/quantity derive from the selected variant.
- `features/products/ProductCard.jsx` / `ProductListItem.jsx` — show "from $X".
- `context/AppContext.jsx` cart — keyed by `variantId`; checkout submits
  `{ variantId, quantity }`.
- `features/cart/CartPage.jsx` / `CheckoutPage.jsx` — render `variantLabel` + variant price.
- `features/orders/OrderDetailPanel.jsx` — show snapshot `productName` + `variantLabel`.
- Admin `features/products/ProductFormModal.jsx` / `ManageProductsPanel.jsx` — repeatable
  variants editor (label/sku/pricingMode/basePrice/stock/isDefault) each with
  quantity-options + price-breaks; role-tagged image list; nested payload. CSV
  (`csvHelpers`) scoped to default variant for this phase.

## Tests & verification
- Backend: product/order/category/thermalPrinter/order.routes tests → variant shape; add
  `pricing.ts` unit tests (price-break resolution, UNIT vs WEIGHT, stock at variant level).
- Frontend: ProductItemPage/CartPage/CheckoutPage/ManageProductsPanel/ProductsPage tests;
  Playwright customer-order + checkout pick a variant through to the order.
- Verify: seed creates UNIT + WEIGHT products; manual 2-variant flow on the dev stack
  (selector → correct price/stock → add to cart → checkout → order shows
  productName + variantLabel → receipt prints the variant).

## Sequencing
1. schema + migration + seed → 2. `pricing.ts` + tests → 3. backend product/category +
validators → 4. backend order/stock + thermal printer → 5. frontend data layer →
6. customer UI → 7. admin variant editor → 8. test + e2e + manual verification.
</content>

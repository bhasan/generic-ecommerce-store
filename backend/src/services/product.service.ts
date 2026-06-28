import { Prisma, CardSize, PricingMode, ImageRole } from '../../generated/prisma';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { RoleName, hasAnyRole } from '../constants/roles';
import { logger } from '../utils/logger';
import { deleteUploadedFile } from '../utils/fileUtils';
import type { SearchService, ProductVisibilityFilter } from './search/search.service';
import { PostgresSearchService } from './search/postgres.search.service';
import { productInclude, visibilityFilterToWhere } from './product.shared';

interface VariantQuantityOptionInput {
  quantity: number;
  sortOrder?: number;
}

interface VariantPriceBreakInput {
  minQuantity: number;
  unitPrice: number;
}

interface VariantInput {
  id?: number;
  label: string;
  sku?: string;
  pricingMode?: PricingMode;
  basePrice: number;
  stock?: number;
  stockEnabled?: boolean;
  isDefault?: boolean;
  active?: boolean;
  sortOrder?: number;
  quantityOptions?: VariantQuantityOptionInput[];
  priceBreaks?: VariantPriceBreakInput[];
}

interface ProductImageInput {
  url: string;
  role?: ImageRole;
  sortOrder?: number;
}

interface CreateProductData {
  name: string;
  slug?: string;
  categoryId: number;
  description?: string;
  vipOnly?: boolean;
  hidden?: boolean;
  cardSize?: CardSize;
  sortOrder?: number;
  images?: ProductImageInput[];
  variants: VariantInput[];
}

interface UpdateProductData {
  name?: string;
  slug?: string;
  categoryId?: number;
  description?: string;
  vipOnly?: boolean;
  hidden?: boolean;
  cardSize?: CardSize;
  sortOrder?: number;
  images?: ProductImageInput[];
  variants?: VariantInput[];
}


function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
}

export class ProductService {
  private searchService: SearchService;

  constructor(searchService?: SearchService) {
    this.searchService = searchService ?? new PostgresSearchService();
  }

  private normalizeCategoryId(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
    return Number.isFinite(parsed as number) ? (parsed as number) : undefined;
  }

  /** Generate a slug unique across products (optionally ignoring one product id). */
  private async uniqueSlug(base: string, ignoreId?: number): Promise<string> {
    const root = slugify(base);
    let candidate = root;
    let n = 1;
    // Loop until no other product owns the candidate slug.
    while (true) {
      const existing = await prisma.product.findFirst({ where: { slug: candidate }, select: { id: true } });
      if (!existing || existing.id === ignoreId) return candidate;
      candidate = `${root}-${n++}`;
    }
  }

  /** Build the nested create payload for a variant + its options/breaks. */
  private buildVariantCreate(variant: VariantInput, slug: string, index: number): Prisma.ProductVariantCreateWithoutProductInput {
    return {
      label: variant.label,
      sku: variant.sku?.trim() || `${slug}-${index + 1}`,
      pricingMode: variant.pricingMode ?? PricingMode.UNIT,
      basePrice: new Prisma.Decimal(variant.basePrice),
      stock: new Prisma.Decimal(variant.stock ?? 0),
      stockEnabled: variant.stockEnabled ?? true,
      isDefault: variant.isDefault ?? false,
      active: variant.active ?? true,
      sortOrder: variant.sortOrder ?? index,
      quantityOptions: {
        create: (variant.quantityOptions ?? []).map((o, i) => ({
          quantity: new Prisma.Decimal(o.quantity),
          sortOrder: o.sortOrder ?? i,
        })),
      },
      priceBreaks: {
        create: (variant.priceBreaks ?? []).map((b) => ({
          minQuantity: new Prisma.Decimal(b.minQuantity),
          unitPrice: new Prisma.Decimal(b.unitPrice),
        })),
      },
    };
  }

  /** Ensure exactly one default variant (first one wins if none/multiple flagged). */
  private withSingleDefault(variants: VariantInput[]): VariantInput[] {
    if (variants.length === 0) return variants;
    const hasDefault = variants.some((v) => v.isDefault);
    return variants.map((v, i) => ({ ...v, isDefault: hasDefault ? !!v.isDefault : i === 0 }));
  }

  private toVisibilityFilter(userRoles: RoleName[] | undefined): ProductVisibilityFilter {
    if (hasAnyRole(userRoles, ['ADMIN', 'MANAGEMENT'])) return { includeHidden: true, includeVipOnly: true };
    if (hasAnyRole(userRoles, ['VIP'])) return { includeHidden: false, includeVipOnly: true };
    return { includeHidden: false, includeVipOnly: false };
  }

  private visibilityWhere(userRoles: RoleName[] | undefined): Prisma.ProductWhereInput {
    return visibilityFilterToWhere(this.toVisibilityFilter(userRoles));
  }

  async getAllProducts(userRoles?: RoleName[], limit?: number, offset?: number) {
    const where = this.visibilityWhere(userRoles);

    const products = await prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
      ...(limit !== undefined && { take: limit }),
      ...(offset !== undefined && { skip: offset }),
    });

    // Reviews feature remains disabled at the list level; populated by getProductById.
    return products.map((product) => ({ ...product, reviews: [] }));
  }

  async searchProducts(
    userRoles: RoleName[] | undefined,
    q: string,
    pagination: { limit: number; offset: number },
  ) {
    const visibility = this.toVisibilityFilter(userRoles);
    const results = await this.searchService.searchProducts(visibility, q, pagination);
    return results.map((p) => ({ ...p, reviews: [] }));
  }

  async getProductById(id: number, userRoles?: RoleName[]) {
    const product = await prisma.product.findUnique({ where: { id }, include: productInclude });

    if (!product) {
      throw new AppError('Product not found', 404);
    }
    if (product.hidden && !hasAnyRole(userRoles, ['ADMIN', 'MANAGEMENT'])) {
      throw new AppError('Product not found', 404);
    }
    if (product.vipOnly && !hasAnyRole(userRoles, ['ADMIN', 'MANAGEMENT', 'VIP'])) {
      throw new AppError('Product not found', 404);
    }

    const reviews = await prisma.review.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
    });
    const userIds = [...new Set(reviews.map((r) => r.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      ...product,
      reviews: reviews.map((review) => ({ ...review, user: userMap.get(review.userId) || null })),
    };
  }

  async createProduct(data: CreateProductData) {
    logger.info('Creating product', { name: data.name, categoryId: data.categoryId });

    const categoryId = this.normalizeCategoryId(data.categoryId);
    if (!categoryId) throw new AppError('Category is required', 400);
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new AppError('Category not found', 400);

    if (!data.variants || data.variants.length === 0) {
      throw new AppError('A product needs at least one variant', 400);
    }

    const slug = await this.uniqueSlug(data.slug?.trim() || data.name);
    const variants = this.withSingleDefault(data.variants);

    const product = await prisma.product.create({
      data: {
        name: data.name,
        slug,
        categoryId,
        description: data.description,
        vipOnly: data.vipOnly ?? false,
        hidden: data.hidden ?? false,
        cardSize: data.cardSize ?? CardSize.STANDARD,
        sortOrder: data.sortOrder ?? 0,
        images: {
          create: (data.images ?? []).map((img, i) => ({
            url: img.url,
            role: img.role ?? ImageRole.GALLERY,
            sortOrder: img.sortOrder ?? i,
          })),
        },
        variants: {
          create: variants.map((v, i) => this.buildVariantCreate(v, slug, i)),
        },
      },
      include: productInclude,
    });

    logger.info('Product created', { productId: product.id, variants: product.variants.length });
    return product;
  }

  async updateProduct(id: number, data: UpdateProductData) {
    const existing = await prisma.product.findUnique({ where: { id }, include: { images: true, variants: true } });
    if (!existing) throw new AppError('Product not found', 404);

    logger.info('Updating product', { productId: id, fields: Object.keys(data) });

    const normalizedCategoryId = this.normalizeCategoryId(data.categoryId);
    if (data.categoryId !== undefined) {
      if (!normalizedCategoryId) throw new AppError('Category is invalid', 400);
      const category = await prisma.category.findUnique({ where: { id: normalizedCategoryId } });
      if (!category) throw new AppError('Category not found', 400);
    }

    const slug = data.slug !== undefined ? await this.uniqueSlug(data.slug || existing.name, id) : undefined;

    const updated = await prisma.$transaction(async (tx) => {
      // Scalar fields
      await tx.product.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(slug !== undefined && { slug }),
          ...(normalizedCategoryId !== undefined && { categoryId: normalizedCategoryId }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.vipOnly !== undefined && { vipOnly: data.vipOnly }),
          ...(data.hidden !== undefined && { hidden: data.hidden }),
          ...(data.cardSize !== undefined && { cardSize: data.cardSize }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        },
      });

      // Images: replace-all (not FK-referenced)
      if (data.images !== undefined) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.productImage.createMany({
          data: data.images.map((img, i) => ({
            productId: id,
            url: img.url,
            role: img.role ?? ImageRole.GALLERY,
            sortOrder: img.sortOrder ?? i,
          })),
        });
      }

      // Variants: upsert by id; new ones created; removed ones soft-deactivated
      // (hard delete is unsafe — they may be referenced by order items).
      if (data.variants !== undefined) {
        const productSlug = slug ?? existing.slug;
        const variants = this.withSingleDefault(data.variants);
        const keptIds = variants.filter((v) => v.id).map((v) => v.id!) as number[];

        if (keptIds.length > 0) {
          await tx.productVariant.updateMany({
            where: { productId: id, id: { notIn: keptIds } },
            data: { active: false },
          });
        } else {
          await tx.productVariant.updateMany({
            where: { productId: id },
            data: { active: false },
          });
        }

        await Promise.all(variants.map(async (v, i) => {
          if (v.id) {
            await tx.productVariant.update({
              where: { id: v.id },
              data: {
                label: v.label,
                ...(v.sku?.trim() && { sku: v.sku.trim() }),
                pricingMode: v.pricingMode ?? PricingMode.UNIT,
                basePrice: new Prisma.Decimal(v.basePrice),
                stock: new Prisma.Decimal(v.stock ?? 0),
                stockEnabled: v.stockEnabled ?? true,
                isDefault: v.isDefault ?? false,
                active: v.active ?? true,
                sortOrder: v.sortOrder ?? i,
                quantityOptions: {
                  deleteMany: {},
                  create: (v.quantityOptions ?? []).map((o, oi) => ({
                    quantity: new Prisma.Decimal(o.quantity),
                    sortOrder: o.sortOrder ?? oi,
                  })),
                },
                priceBreaks: {
                  deleteMany: {},
                  create: (v.priceBreaks ?? []).map((b) => ({
                    minQuantity: new Prisma.Decimal(b.minQuantity),
                    unitPrice: new Prisma.Decimal(b.unitPrice),
                  })),
                },
              },
            });
          } else {
            await tx.productVariant.create({
              data: { productId: id, ...this.buildVariantCreate(v, productSlug, i) },
            });
          }
        }));
      }

      return tx.product.findUnique({ where: { id }, include: productInclude });
    });

    // Clean up image files no longer referenced by any product
    if (data.images !== undefined) {
      const oldUrls = existing.images.map((img) => img.url);
      const newUrls = (data.images ?? []).map((img) => img.url);
      const removed = oldUrls.filter((u) => !newUrls.includes(u));
      if (removed.length > 0) {
        const orphaned = await this.getOrphanedUrls(id, removed);
        await Promise.all(orphaned.map((url) => deleteUploadedFile(url)));
      }
    }

    logger.info('Product updated', { productId: id });
    return updated;
  }

  /** Upload URLs from a product not referenced by any other product's images. */
  private async getOrphanedUrls(excludeProductId: number, urls: string[]): Promise<string[]> {
    if (urls.length === 0) return [];
    const others = await prisma.productImage.findMany({
      where: { productId: { not: excludeProductId }, url: { in: urls } },
      select: { url: true },
    });
    const usedElsewhere = new Set(others.map((o) => o.url));
    return urls.filter((u) => !usedElsewhere.has(u));
  }

  async deleteProduct(id: number) {
    const product = await prisma.product.findUnique({ where: { id }, include: { images: true } });
    if (!product) throw new AppError('Product not found', 404);

    logger.info('Deleting product', { productId: id, name: product.name });

    const urlsToCheck = product.images.map((img) => img.url);
    // Cascade removes variants/images/options/breaks; fails if a variant is referenced
    // by an order item (Restrict) — surfaced to the caller as a constraint error.
    await prisma.product.delete({ where: { id } });

    const orphaned = await this.getOrphanedUrls(id, urlsToCheck);
    await Promise.all(orphaned.map((url) => deleteUploadedFile(url)));

    return { message: 'Product deleted successfully' };
  }
}

export default new ProductService();


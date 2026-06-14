import { ZodType } from 'zod';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(result.error.issues[0].message, 400);
  }
  return result.data;
}

export interface SettingsStoreConfig<T> {
  key: string;
  schema: ZodType<T>;
  defaults: T;
  onRead?: (raw: T) => T;
  onWrite?: (data: T) => T;
}

export class SettingsStore<T extends object> {
  constructor(private readonly config: SettingsStoreConfig<T>) {}

  async read(): Promise<T> {
    const { key, defaults, onRead } = this.config;
    const row = await prisma.uiSetting.findUnique({ where: { key } });
    if (!row) {
      return structuredClone(defaults);
    }
    const stored = row.value as unknown as Partial<T>;
    const merged = { ...structuredClone(defaults), ...stored } as T;
    return onRead ? onRead(merged) : merged;
  }

  async write(data: T): Promise<T> {
    const { key, schema, onWrite } = this.config;
    const validated = parseOrThrow(schema, data);
    const toStore = onWrite ? onWrite(validated) : validated;
    await prisma.uiSetting.upsert({
      where: { key },
      update: { value: toStore as object },
      create: { key, value: toStore as object },
    });
    return validated;
  }
}

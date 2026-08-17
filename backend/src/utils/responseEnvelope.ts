export function successResponse(data: unknown, message?: string) {
  return { success: true as const, ...(message !== undefined ? { message } : {}), data };
}

export function listResponse(data: unknown[], meta: { count: number; limit: number; offset: number }) {
  return { success: true as const, data, meta };
}

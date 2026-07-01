export interface PosPaymentPayload {
  id: number;
  method: string;
  amount: number;
  status: string;
}

export interface PosOrderPayload {
  id: number;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  deliveryMethod: string;
  items: { productName: string; variantLabel: string; quantity: number; unitPrice: number }[];
  payments: PosPaymentPayload[];
}

export interface PosContext {
  order: PosOrderPayload;
  externalId?: string | null;
}

export interface PosOrderSync {
  /** Provider decides which statuses it cares about (covers create + all status changes). */
  shouldPushStatus(status: string): boolean;
  pushOrder(ctx: PosContext): Promise<{ externalId: string | null }>;
  pushStatus(ctx: PosContext): Promise<void>;
}

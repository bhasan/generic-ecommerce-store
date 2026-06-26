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

export interface PosProvider {
  /** Provider decides which statuses it cares about (covers create + all status changes). */
  shouldPushStatus(status: string): boolean;
  pushOrder(order: PosOrderPayload): Promise<void>;
  pushPayment(order: PosOrderPayload): Promise<void>;
}

// Normalize an included order item into the response shape, preferring the stored
// snapshots (productName/variantLabel/unitPrice) and adding a display image + a `price`
// alias for backward compatibility.
export function shapeOrderItem(item: any) {
  const product = item.variant?.product ?? null;
  const images: Array<{ url: string; role: string }> = product?.images ?? [];
  const image = images.find((i) => i.role === 'THUMBNAIL')?.url ?? images[0]?.url ?? null;
  return {
    id: item.id,
    variantId: item.variantId,
    productId: product?.id ?? null,
    productName: item.productName,
    variantLabel: item.variantLabel,
    productImage: image,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    price: item.unitPrice,
    voided: item.voided,
    addedAfterSubmission: item.addedAfterSubmission,
    product: product ? { id: product.id, name: product.name, image } : null,
  };
}

export function shapeStatusEvents(events: any[]) {
  return events.map(event => ({
    id: event.id,
    fromStatus: event.fromStatus ?? null,
    toStatus: event.toStatus,
    changedBy: event.changedBy ?? null,
    note: event.note ?? null,
    createdAt: event.createdAt.toISOString(),
  }));
}

export function shapePayments(payments: any[]) {
  return payments.map(payment => ({
    id: payment.id,
    method: payment.method,
    status: payment.status,
    amount: Number(payment.amount),
    transactionId: payment.transactionId ?? null,
    paymentHandle: payment.paymentHandle ?? null,
    createdAt: payment.createdAt.toISOString(),
  }));
}

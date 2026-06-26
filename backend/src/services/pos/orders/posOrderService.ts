// Temporary shim — replaced by the outbox implementation in the outbox task.
export async function pushOrderCreated(_orderId: number): Promise<void> { /* no-op until outbox */ }
export async function pushOrderUpdated(_orderId: number): Promise<void> { /* no-op until outbox */ }

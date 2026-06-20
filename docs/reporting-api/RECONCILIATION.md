# Online Store Reporting API Reconciliation

Minimum reconciliation rules:

- `sum(line_items.gross_sales)` should equal `order.subtotal` before order-level discounts, depending on discount model.
- `sum(line_items.net_sales) + tax_total + shipping_total` should reconcile to `grand_total`.
- `sum(payments.amount)` should reconcile to paid amount for paid orders.
- `sum(refunds.amount)` should reconcile to refunded order amount.
- `refunded_quantity` should not exceed sold quantity.
- Cancelled orders should not inflate paid sales.
- Inventory quantity should not go negative unless explicitly allowed.
- Inventory snapshots must not be presented as movement history.
- Document any source schema limitation that prevents exact reconciliation.
- Downstream consumers should rerun recent windows for reconciliation and avoid unsupported automation claims.

The reporting API should expose source facts and caveats without making unsupported automation claims.

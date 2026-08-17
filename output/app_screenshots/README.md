# Generic Ecommerce Store — App Screenshots

Captured from the local dev stack (`http://localhost:5843`, tenant `app`) on 2026-07-16
at a 1440×900 viewport (full-page). Seed accounts used: `johncustomer/customer123`,
`manager/manager123`, `admin/admin123` (ADMIN+SUPER_ADMIN), `driver/driver123`.

## Public (logged out)
| # | View | File |
|---|------|------|
| 01 | Login | `01-login.png` |
| 02 | Register | `02-register.png` |

## Customer (user view)
| # | View | File |
|---|------|------|
| 03 | Home / landing | `03-customer-home.png` |
| 04 | Products storefront | `04-customer-products.png` |
| 05 | Product detail (quick view) | `05-customer-product-detail.png` |
| 06 | Cart | `06-customer-cart.png` |
| 07 | Checkout | `07-customer-checkout.png` |
| 08 | Order placed / success | `08-customer-order-success.png` |
| 09 | My Orders (customer order tracking) | `09-customer-my-orders.png` |
| 10 | Profile | `10-customer-profile.png` |
| 11 | Help (⚠ crashes — see Known issues) | `11-customer-help-error.png` |

## Staff / Management
| # | View | File |
|---|------|------|
| 12 | Orders board (staff view) | `12-staff-orders.png` |
| 13 | Manage Store → Products | `13-manage-products.png` |
| 14 | Manage Store → Categories | `14-manage-categories.png` |
| 15 | Manage Store → Media Library | `15-manage-media.png` |
| 16 | Manage Store → Bulk Management | `16-manage-bulk.png` |
| 34 | Manage Store → Inventory (per-store overrides) | `34-manage-inventory.png` |
| 32 | Store Credit management | `32-store-credit.png` |
| 33 | Orders History | `33-order-history.png` |

## Admin Dashboard
| # | View | File |
|---|------|------|
| 17 | Pending Registrations | `17-dashboard-pending-registrations.png` |
| 18 | Announcements | `18-dashboard-announcements.png` |
| 19 | Messages | `19-dashboard-messages.png` |
| 20 | VIP Management | `20-dashboard-vip-management.png` |
| 21 | Landing Page settings | `21-dashboard-landing-page.png` |
| 22 | Users management | `22-dashboard-users.png` |
| 23 | Rejected Users | `23-dashboard-rejected-users.png` |

## Website Management
| # | View | File |
|---|------|------|
| 24 | Store Identity | `24-website-identity.png` |
| 25 | Brand Colors | `25-website-colors.png` |
| 26 | Hero Image | `26-website-hero.png` |
| 27 | Favicon & Assets | `27-website-favicon.png` |
| 28 | Store Info | `28-website-info.png` |
| 29 | Payment Settings | `29-website-payment.png` |
| 30 | Delivery Settings | `30-website-delivery.png` |
| 31 | Stores | `31-website-stores.png` |

## Delivery
| # | View | File |
|---|------|------|
| 35 | Delivery Dashboard (admin view) | `35-delivery-dashboard.png` |
| 38 | Delivery Dashboard (driver view, trimmed nav) | `38-driver-delivery-dashboard.png` |

## Super-Admin Console (admin subdomain scope)
| # | View | File |
|---|------|------|
| 36 | Tenants | `36-admin-tenants.png` |
| 37 | Activity (global audit feed) | `37-admin-activity.png` |

## Known issues found while capturing
- **`/help` crashes** with `ReferenceError: MessageCircle is not defined` (missing
  `lucide-react` import in `HelpPage`). The route renders the app-wide error boundary
  ("Something went wrong") for all roles. See `11-customer-help-error.png`.

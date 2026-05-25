# Aeris

**GitHub description:** AI-powered multi-tenant ecommerce storefronts for African merchants, with onboarding, generated storefront previews, Kora-style checkout, orders, payouts, and merchant operations.

Aeris is a hackathon MVP for helping African merchants launch credible online storefronts without hiring a developer or stitching together ecommerce infrastructure. A merchant enters business, payout, brand, and product details; Aeris generates a storefront preview; the merchant claims a slug; and customers can shop from a public storefront with cart, checkout, and order status.

## What This MVP Shows

- Merchant landing page with Aeris product positioning.
- Five-step merchant onboarding for business details, payout account, products, brand customization, and review.
- Product entry with manual rows, add/remove behavior, bulk paste support, and Cloudinary-bucket upload framing.
- Visual brand color selection with presets, native color picker, RGB sliders, and live preview.
- Store generation progress screen and preview mode.
- Claim flow with generated slug, regenerate action, and reserved-slug validation.
- Merchant dashboard with store overview, product management, orders, payouts, settings, and responsive mobile drawer navigation.
- Customer storefront at `/s/[slug]` with featured products, catalog, cart, checkout, and order status.
- Core business rules for checkout fees, order transitions, payout eligibility, and AI-draft product labeling.

## Demo Flow

1. Open `http://localhost:3123/`.
2. Click `Start building`.
3. Complete onboarding through `/onboarding`.
4. Generate and preview the storefront.
5. Claim the store and publish it.
6. Visit the public storefront at `/s/terra-basket`.
7. Add a product to cart, checkout, and view the order status.
8. Return to the merchant dashboard from the order status page.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- CSS custom properties using the Aeris Paper/Forest design system
- Vitest for business-rule tests
- Local browser storage for MVP persistence

## Design System Notes

The UI follows the Aeris product visual language:

- Paper background with fixed mosaic pattern.
- Forest, grid, coral, mint, and gold color tokens.
- Space Grotesk for display type.
- General Sans for body text.
- JetBrains Mono for labels, metadata, buttons, and navigation.
- 1px borders, square geometry, and no shadows.
- Merchant dashboard navigation collapses into a mobile drawer.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npx next dev -p 3123
```

Open:

```text
http://localhost:3123
```

Run tests:

```bash
npm test
```

Build for production:

```bash
npm run build
```

## Important Routes

- `/` — merchant landing page
- `/onboarding` — merchant onboarding wizard
- `/onboarding/generating` — generation progress screen
- `/onboarding/preview` — generated storefront preview
- `/claim` — claim draft and publish
- `/store` — merchant store overview
- `/products` — merchant product management
- `/orders` — merchant order management
- `/payouts` — payout ledger
- `/settings` — store settings
- `/s/[slug]` — public storefront
- `/cart` — customer cart
- `/checkout` — customer checkout
- `/order/[ref]` — customer order status

## MVP Architecture

This implementation intentionally models storefronts as tenant-rendered views over shared application state. It does not generate or deploy a separate app per merchant. The current MVP uses local storage to keep the demo self-contained, while the domain module keeps the important commerce rules isolated for later Supabase and Kora integration.

## Next Production Steps

- Replace local storage with Supabase Auth, Postgres, and Realtime.
- Implement Cloudinary upload signing and persisted product image assets.
- Add Kora hosted checkout session creation and webhook verification.
- Add server-side tenant resolution for wildcard domains.
- Add Prisma or Supabase schema migrations for merchants, stores, products, orders, payouts, and audit events.
- Add end-to-end tests for onboarding, publish, checkout, order status updates, and payout requests.

## Co-Authoring

Project changes should be committed with:

```text
Co-authored-by: temiloluuu <temiloluuu@gmail.com>
```

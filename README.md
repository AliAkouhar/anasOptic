# ANASS VISION — optician ERP + BI (clickable MVP)

A polished, clickable MVP of a web application for an optician with several shops (_succursales_)
and one main lab (_labo_). Everything runs in the browser on **deterministic mock data**: creating an
order, moving it through the workshop, collecting the balance, cancelling, transferring stock… updates
every screen and every KPI instantly. There is **no backend**; the data layer is written so it can be
swapped for Supabase without touching the UI (see [Supabase migration notes](#supabase-migration-notes)).

- French by default (`/fr/…`), English available (`/en/…`)
- Phone, tablet and laptop layouts (tested at 375 px, 768 px and 1440 px)
- Light and dark themes

---

## Quick start

Requirements: Node.js 20.9+ (tested with Node 24).

```bash
pnpm i && pnpm dev        # or: npm install && npm run dev
```

Open <http://localhost:3000>: it redirects to `/fr/login`.

| Script | What it does |
| --- | --- |
| `pnpm dev` | Development server (Turbopack) |
| `pnpm build` / `pnpm start` | Production build / server |
| `pnpm test` | Vitest unit tests (business math, repository rules, translations) |
| `pnpm lint` | ESLint (Next.js + React Compiler rules) |
| `pnpm typecheck` | TypeScript, strict mode |

The mock database is generated on first load and the changes you make are kept in `localStorage`, so a
page refresh keeps the demo state. **Réinitialiser la démo** (user menu, or _Paramètres → Démo_) starts
over with a fresh data set.

---

## Demo accounts

Every account uses the password **`demo`**. The login page also has two big buttons that sign in
directly, and a **role switcher** (orange “Démo” pill in the top bar) switches user live during a
presentation.

| Person | Email | Role | Location |
| --- | --- | --- | --- |
| Anass Berrada | `anass.berrada@anassvision.ma` | Super admin (the optician) | all |
| Khadija Amrani | `khadija.amrani@anassvision.ma` | Secrétaire | Succursale Centre |
| Nadia Squalli | `nadia.squalli@anassvision.ma` | Secrétaire | Succursale Centre |
| Imane Tazi | `imane.tazi@anassvision.ma` | Secrétaire | Succursale Nord |
| Siham Lahlou | `siham.lahlou@anassvision.ma` | Secrétaire | Succursale Nord |
| Houda Chraibi | `houda.chraibi@anassvision.ma` | Secrétaire | Succursale Sud |
| Loubna Fassi | `loubna.fassi@anassvision.ma` | Secrétaire — **deactivated** (shows the “Désactivée” state) | Succursale Sud |

---

## Demo script

Numbers below (invoice numbers, amounts) depend on the day the data was generated; the behaviour does not.

1. **Log in as Secrétaire – Centre** (second demo card). Click **+ Nouvelle commande**.
   - _Client_: choose **Nouveau client**, type a name and a mobile number, keep **Numéro WhatsApp** on.
   - _Mesures_: type OD/OG values (the ± buttons step by 0.25), try **Copier OD → OG**.
   - _Produits et paiement_: pick a frame (each card shows the Centre stock, “Rupture” ones are disabled),
     a lens type/lens and treatments, **Total 2 400**, **Avance 1 000** (or the 30 % / 50 % / 100 % chips).
     The reste (1 400 DH) is shown live.
   - **Valider la commande** → the success screen shows the next Centre invoice number, e.g. “N° 817 – Succursale Centre”.
2. Still as the secrétaire: no **Tableau de bord** in the menu (opening `/fr/dashboard` shows “Accès non
   autorisé”), no charges/margin card on the order, and **Commandes / Clients / Stock** only show Centre data.
3. Switch to **Opticien** with the role switcher. The bell shows “Nouvelle commande N° … : charges à
   compléter”. Click it → the order opens on **Charges et marge**. Click **Pré-remplir avec les prix
   d'achat**, choose **Labo principal** as the lens source (its stock is shown), **Enregistrer les
   charges**: the margin appears and the Labo lens stock decreases by 2 (visible in _Stock → Labo principal_).
4. Click **Envoyer à l'atelier**, **Marquer comme préparée**, **Arrivée en succursale**. The toast (and the
   order header) offers **Prévenir sur WhatsApp**, which opens `wa.me` with the pre-filled French message.
5. Click **Marquer comme livrée**: the app asks to **Encaisser le reste** first (1 400 DH pre-filled).
   Confirm → the order is delivered, reste 0 DH.
6. **Tableau de bord**: revenue and order count include the new order. Toggle **vs M-1 / vs A-1**, filter
   by shop with the location selector, try the period presets. Every chart has a one-line insight and a
   table view (grid icon).
7. **Cancel another order** (order page → ⋯ → _Annuler la commande_): the dialog lists the consequences;
   the frame returns to stock, the deposit is recorded as refunded and revenue drops.
8. **Stock → Transferts**: from **Labo principal** to **Succursale Nord**, pick a lens, quantity **5**. The
   preview shows “Labo : 20 → 15 · Nord : 2 → 7” before confirming; both stocks update.
9. **Paramètres**
   - _Listes → Marques_: rename **Rayban** to **Ray-Ban** — it changes everywhere (orders, stock, pickers).
     A used brand only offers **Archiver** (tooltip explains why), never delete.
   - _Succursales et labo_: **Ajouter une succursale** “Succursale Est” — it appears at once in every
     selector, with invoice numbering starting at N° 1.
   - _Champs personnalisés_: add a field (e.g. “Écart pupillaire (mm)”) — it appears in the order form
     (step _Mesures_) and in the live preview.
10. _Rôles et permissions_ → **Nouveau rôle** “Technicien atelier”, tick **Voir l'atelier**, **Envoyer à
    l'atelier**, **Marquer préparée**, save. _Utilisateurs_ → **Inviter** someone with that role (or change
    an existing user's role). Switch to that user: the menu only shows **Atelier**.
11. User menu → **Langue → English**: every screen, status, toast, chart and date switches to English.

---

## What is inside

**Stack**: Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind CSS 4 ·
shadcn/ui (Radix) · lucide-react · Recharts 3 · Zustand 5 (`persist`) · next-intl 4 · react-hook-form +
zod 4 · @dnd-kit · date-fns · @faker-js/faker (seed 42) · Vitest.

> Next.js 16 replaced `middleware.ts` with `proxy.ts`; the locale routing lives in `src/proxy.ts`.

```
src/
  app/[locale]/(auth)/login        login + demo cards
  app/[locale]/(app)/…             dashboard, orders (board/list, new, [id]), workshop, clients, stock,
                                   stock/transfers, purchases, charges, settings, notifications
  components/                      feature folders + ui/ (shadcn)
  lib/types.ts                     domain model (1 type = 1 future table)
  lib/permissions.ts               permission keys, can(), location scoping, route rules
  lib/calculations.ts              ALL business math, pure functions (unit-tested)
  lib/format.ts                    money (1 250 DH / DH 1,250), prescriptions (+1.25 / −0.75), phones
  data/seed.ts                     deterministic mock data (faker.seed(42)), run in a Web Worker
  data/store.ts                    Zustand store = the mock database (+ session store)
  data/persistence.ts              persist adapter: stores only the demo's changes (see below)
  data/repositories/               the only layer that writes; one function per business action
  data/hooks.ts, data/indexes.ts   read side: scoped, memoised selectors
  messages/fr.json, en.json        every UI string (1 000+ keys, parity-tested)
```

### Data layer

- **Repositories are the only writers.** UI components call e.g. `ordersRepo.setStatus(id, "workshop")`;
  each function checks the permission and location scope (like RLS will), validates the business rule,
  and applies all table changes in **one store update** (a transaction). Reads go through hooks that
  apply the same scoping.
- **Optimistic UI + latency**: writes apply instantly, then resolve after a short simulated delay;
  first loads of list pages show ~300 ms skeletons. Non-destructive actions return an `undo` handle
  used by the **Annuler** button in toasts.
- **Persistence**: the full seed is ~4 MB of JSON (too close to the `localStorage` quota), but it is
  deterministic from its anchor date. So `persist` stores only a *patch* (rows added/changed/removed
  per table) and the seed is regenerated from its anchor on load — in a Web Worker, off the main
  thread. All storage access is wrapped in `try/catch`; if storage is unavailable the demo keeps
  working in memory.
- **Stock is never stored**: a level is `SUM(movements.qty)` per product and location.

### Business rules (where to find them)

| # | Rule | Code |
| --- | --- | --- |
| 1 | Create order: `confirmed`, invoice N° = max + 1 per location, frame stock out, status event, “charges à compléter” notification | `ordersRepo.create` |
| 2 | Status flow forward one step, or cancel before delivered; each change logged; per-status permission | `ordersRepo.setStatus`, `canTransition` |
| 3 | `in_store` → WhatsApp link with pre-filled French message | `components/orders/whatsapp.ts`, `order-actions.tsx` |
| 4 | `delivered` only when reste = 0, otherwise “Encaisser le reste” first | `ordersRepo.collectAndDeliver` |
| 5 | reste = total − Σ payments, always computed | `computeReste` / `orderReste` |
| 6 | Cancel: reverse stock, refund deposits, exclude from revenue | `ordersRepo.cancel`, `computeKpis` |
| 7 | Admin costs + lens source (lab / store / supplier), stock deducted, costs completed | `ordersRepo.saveCosts` |
| 8 | Transfers: `transfer_out` + `transfer_in` in one action, blocked if not enough stock | `stockRepo.transfer` |
| 9 | Receiving a purchase order adds `purchase` movements | `purchasesRepo.markReceived` |
| 10 | Low stock notification after movements, no duplicates | `lowStockNotifications` |
| 11 | Used options can only be archived; entities store ids so renames propagate | `optionsRepo.remove`, `useLabels` |
| 12 | Client segment from non-cancelled order count (thresholds in settings) | `clientSegment`, `clientStats` |
| 13 | Gross = revenue − order costs; net = gross − fixed charges (prorated by day); orders without costs flagged | `computeMargins`, `fixedChargesForRange` |

### Permissions

Roles are data (a list of permission keys). `can(user, key)` gates navigation, routes, buttons and table
columns; hidden routes render “Accès non autorisé”. Costs, charges and margins are **not rendered at
all** for users without `orders.view_costs` / `charges.view` (the component and its data reads are
skipped, not hidden with CSS). A secrétaire only sees orders, clients and stock of her own location.

One key was added to the list in the brief: **`workshop.view`** (the Atelier page), needed for a
“Technicien atelier” role with only Atelier access.

### Design system

Tokens in `src/app/globals.css` (light + dark): primary `#0F4C5C`, attention `#E36414`, success
`#2A9D8F`, danger `#C0392B`. Where a brand colour is too light for small text (orange, green), a darker
AA-safe shade is used for text and filled badges. Chart colours and the status colours were checked with
a colour-vision-deficiency validator in both themes: the spec's blue (confirmed) and violet (workshop)
were indistinguishable for deuteranopes, so they are separated by lightness.

---

## Quality checks

- `pnpm test` — 43 tests: reste, margins and prorated fixed charges, stock levels, segments, M-1/A-1
  shifts and deltas, invoice numbering, status flow, input parsing; repository rules (invoice numbers
  per location and sequential, delivered requires reste = 0, cancel returns frame **and** lens stock,
  transfers are atomic, costs are admin-only, used options are archived not deleted); translation key
  parity, valid ICU messages and matching placeholders FR/EN.
- `pnpm lint` and `pnpm typecheck` are clean (no `any`).
- The demo script above was run end-to-end on the production build in a headless browser, and every
  page was checked at 375 / 768 / 1440 px for both roles, in French and English, light and dark: no
  console errors, no horizontal scrolling.
- **Lighthouse** (production build, signed in; median of 3 runs on the development laptop):

  | Page | Desktop perf. | Mobile perf.* | Accessibility |
  | --- | --- | --- | --- |
  | Nouvelle commande | 99–100 | ~78 | 100 |
  | Tableau de bord | ~84 (81–89) | ~74 | 100 |

  \* Lighthouse's mobile profile slows the CPU 4×. The remaining cost is the client doing the work a
  database would do: regenerating the 1 800-order mock database (moved to a Web Worker) and computing
  KPIs in the browser. Charts below the fold are mounted and even downloaded only when scrolled into
  view. With Supabase, the KPIs become SQL views and this client-side work mostly disappears.

---

## Supabase migration notes

The mock layer maps 1:1 to Supabase:

- **Tables** — one per `DB` key in `src/lib/types.ts` (`locations`, `options`, `custom_fields`,
  `products`, `stock_movements`, `stock_thresholds`, `clients`, `orders`, `order_items`, `payments`,
  `order_status_events`, `order_costs`, `fixed_charges`, `suppliers`, `purchase_orders` (+
  `purchase_order_items`), `transfers` (+ `transfer_items`), `notifications`, `roles` (+
  `role_permissions`), `profiles` (users, linked to `auth.users`), `loyalty_settings`, `app_settings`).
  Entities keep storing option **ids**, never labels.
- **Views** — `stock_levels` (`SUM(qty) GROUP BY product_id, location_id`), `order_balances`
  (total − Σ payments), `client_stats` (segment, total spent, last visit). The KPI functions in
  `calculations.ts` become SQL views / RPCs over those.
- **Auth + RLS** — Supabase Auth replaces the demo login. A `has_permission(key)` SQL function reads the
  user's role; RLS policies mirror `can()` and the location scoping in `permissions.ts`:
  `orders.view_all` sees everything, otherwise `location_id = profile.location_id`; `order_costs`,
  `fixed_charges` and cost columns require `orders.view_costs` / `charges.view`.
- **Business rules → Postgres functions** (called with `supabase.rpc`), each one transaction:
  `create_order` (invoice number from a per-location counter row locked `FOR UPDATE`, frame movement,
  deposit, event, notification), `set_order_status`, `collect_and_deliver`, `cancel_order`,
  `save_order_costs`, `transfer_stock`, `receive_purchase_order`, `adjust_stock`. An `AFTER INSERT`
  trigger on `stock_movements` creates `low_stock` notifications (skipping unread duplicates).
- **Repositories** keep their signatures; their bodies become `supabase.from(…)` / `supabase.rpc(…)`
  calls. `settle()` and the undo snapshots go away (undo becomes an inverse RPC where it makes sense).
- **Realtime** — subscribe to `orders`, `stock_movements` and `notifications` so the board, stock and
  bell update across devices.
- **Storage** — not needed yet (no files in scope).

---

## Simplifications (MVP)

- **Mock authentication**: any seeded email + password `demo`; no real invitation emails (the invite
  flow shows “Invitation envoyée” and the invited user can be used immediately via the role switcher).
- **~800 clients instead of ~350**: with ~1 800 orders, a 350-client base averages 5 orders per client,
  so almost everyone would be “Fidèle”. 800 clients give a realistic mix (≈ 53 % nouveau, 29 % régulier,
  19 % fidèle) with some clients at 4–7 orders.
- **Seeded brand “Rayban”** (not “Ray-Ban”) so that demo step 9 has something to rename.
- **Seed shaping**: orders are allocated to days in proportion to the seasonality weights (Saturday /
  Monday, 10–12 h and 17–19 h peaks, slower Ramadan months, busier September) instead of pure random
  draws, so month-to-month comparisons are believable. About 75 % of 3–14-day-old orders already have
  costs, so this month's margin is not wildly inflated; the newest orders never do (notifications exist).
- **Revenue** is recognised at order creation (the order total), cancelled orders excluded; fixed charges
  are prorated by day for partial periods; the “reste à encaisser” KPI covers orders created in the period.
- **Lens items**: a pair of lenses is one order line with quantity 2; lens stock is only deducted when the
  admin chooses the source in the costs panel (as specified).
- **Heatmap**: when the selected period has fewer than 250 orders, it uses the 90 days ending with the
  period (and says so), so habits stay readable.
- **Undo** restores the tables touched by the action; it is refused if a later action changed the same
  tables.
- **Status colours**: blue (confirmed) and violet (workshop) are kept, but separated by lightness, because
  the usual blue/violet pair is indistinguishable for colour-blind users.
- **Margins this month**: the newest orders never have costs yet, so this month's margin is flagged as
  incomplete (banner + link to fill them in) and its M-1 delta is inflated until they are entered.
- **No real WhatsApp API** (wa.me link), no VAT, no insurance/mutuelle, no printed receipts (out of scope).

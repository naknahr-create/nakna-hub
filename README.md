# นากนะ HUB

A multi-customer link hub product under the NAKNA brand, using the primary color `#04878a`. Each signed-in customer owns an independent account, creates branded pages, edits drafts, publishes selected versions, and unlocks click analytics with paid Pro access. Event collection continues on every plan. The landing page presents the product; customer pages use `/h/:slug`.

## Standalone Cloudflare deployment

This repository targets **Cloudflare Workers with Vinext**, D1, and R2. Start with [คู่มือเริ่มต้นภาษาไทย](GITHUB_START_HERE_TH.md). The root `wrangler.jsonc` and `vite.config.ts` are the deployment configuration; this build does not require `.openai/hosting.json` or the original hosting platform.

The public landing page and published customer hubs can run without an authentication provider. **LINE Login is the primary customer sign-in.** Customers can separately opt in to daily analytics messages through the NAKNA HUB LINE Official Account. Follow [การเชื่อม LINE และรายงานประจำวัน](docs/LINE_SETUP_TH.md) to configure the channels, migration, secrets, and webhook. Management remains blocked until a supported login provider is configured; deploying this repository does not create LINE channels or enable message delivery.

Starter is free (1 hub / 5 blocks). Pro is 149 THB/month or 1,490 THB/year (10 hubs / 100 blocks per hub, analytics, CSV, daily LINE reports, and optional public-footer branding removal). Stripe Checkout, Customer Portal, signed webhooks, and paid entitlement expiry are implemented. **New purchases remain disabled until the actual Stripe account, live prices, secrets, webhook and runtime gate are configured.** See [Stripe setup and pricing decisions](docs/STRIPE_SETUP_TH.md). Deploying source alone does not connect a Stripe merchant account.

### Runtime and resources

- Node.js >= 22.13.0; install the committed dependency versions with `npm ci`.
- Vinext / React builds a native Worker using `@cloudflare/vite-plugin`. Keep `package-lock.json` committed.
- D1 binding `DB` uses `nakna-hub-db`; R2 binding `BUCKET` uses `nakna-hub-assets`. `wrangler.jsonc` records the D1 ID for the current account. Change it when deploying to a different account.
- Drizzle schema is in `db/schema.ts`, `db/line-auth-schema.ts`, and `db/line-digest-schema.ts`, `db/hub-billing-schema.ts`, and `db/hub-admin-schema.ts`; versioned SQL migrations and their snapshots are in `drizzle/`. Apply the migrations to the target D1 database before serving database-backed requests.
- `keep_vars: true` preserves dashboard-managed runtime variables across deploys. Authentication variables belong in the Worker's runtime settings, not only the build environment. Keep credentials out of Git.

The existing Cloudflare Workers Builds default deploy command is supported:

| Setting | Value |
| --- | --- |
| Root directory | Repository root |
| Build command | Empty |
| Deploy command | `npx wrangler deploy` |
| Worker name | `nakna-hub` |

The root Wrangler configuration runs `npm run build` as its custom build before deploying `dist/server/index.js`. Vinext builds the source entry specified in `vite.config.ts`. The build finalizer removes only Vite's generated deployment redirect after checking its destination, so repeated bare `wrangler deploy` calls also rebuild from source. It preserves `dist/server/wrangler.json` for explicit deployments and previews; an unexpected redirect stops the build instead of being removed.

An explicit two-step Workers Builds setup is also supported:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npm run deploy:cloudflare` |

`npm run build` produces `dist/server/wrangler.json` and `dist/client`. `deploy:cloudflare` deploys that generated configuration without another build. For a terminal deployment, `npm run deploy` performs both steps. This is not a static GitHub Pages application, and its output is not an OpenNext `.next` build.

```sh
npm ci
npm run db:migrate:local
npm run dev
```

For a local production preview:

```sh
npm run db:migrate:local
npm run build
npm run preview
```

The preview explicitly shares the repository's `.wrangler/state` with local migrations, so the generated configuration under `dist/server/` does not create a separate empty local database.

For the first remote deployment, authenticate Wrangler to the intended Cloudflare account, ensure the configured D1 database and R2 bucket exist, then run:

```sh
npm run db:migrate:remote
npm run deploy
```

The remote migration command writes schema changes to the configured D1 database. It does not copy customer data from another deployment. If applying SQL through the D1 dashboard console, run the committed migrations in filename order and keep the migration ledger consistent before later switching to Wrangler migrations.

Other commands: `npm run lint`, `npm run db:generate`, `npm run test:auth`, `npm run test:line`. Authentication and report tests use SQLite and mocked provider responses; they do not sign in to real LINE accounts or send messages. `npm run start` is an alias for the local production preview; it does not deploy.

### Authentication and operator setup

Configure LINE Login using the [Thai setup guide](docs/LINE_SETUP_TH.md). `/api/auth/config` exposes the selected provider and local sign-in/sign-out URLs without secrets. LINE takes precedence whenever its configuration is valid. It uses authorization code + PKCE, browser-bound one-time state, nonce, server-side ID-token verification, and opaque D1-backed sessions. Only session hashes are stored; cookies are Secure, HttpOnly, and SameSite=Lax. Logout is a same-origin POST to `/auth/logout` and revokes the session in D1. The requested scopes are `openid profile`; an email is not required or invented.

LINE identities are namespaced as `line:<login-channel-id>:<line-user-id>`. Each verified identity owns its own account. Existing Access or original-platform accounts are not merged by email or name. To designate the first platform operator, set `ADMIN_LINE_USER_ID` to the owner's verified LINE user ID from this provider. It grants nothing without a matching authenticated session. The first eligible operator request binds that stable identity in `hub_operators`; changing configuration later does not transfer an existing operator binding.

**Cloudflare Access is an optional fallback for installations without configured LINE Login.** It is not an additional requirement for LINE customers. If switching an existing Access installation to LINE, remove or adjust its edge Access restrictions on customer routes, OAuth callbacks, and the webhook; an edge login wall would prevent those requests from reaching the application. Accounts are still protected by the application session.

For an Access-only installation, create a Cloudflare Access **self-hosted application** for the management paths on the actual deployment hostname. Use one application/AUD for `/studio*`, `/admin*`, `/api/workspace*`, `/api/slugs*`, `/api/pages*`, `/api/uploads*`, `/api/account*`, `/api/operator*`, `/api/line/settings*`, `/api/line/preview*`, and `/api/line/test*`, plus the authenticated `/api/billing`, `/api/billing/checkout`, `/api/billing/portal`, and `/api/billing/sync` routes. Keep `/`, `/h/*`, `/go/*`, `/media/*`, `/api/hubs/*`, `/api/events`, `/api/auth/config`, `/api/line/webhook`, and `/api/billing/webhook` reachable without an edge login wall; the application still verifies authorization and webhook signatures as appropriate. Protecting the entire hostname would also require visitors to sign in to public hubs.

Set these Worker runtime variables after creating the Access application:

| Variable | Value and purpose |
| --- | --- |
| `CF_ACCESS_TEAM_DOMAIN` | `https://<your-team>.cloudflareaccess.com`; the Access issuer |
| `CF_ACCESS_AUD` | The application's AUD tag, a 64-character value copied from its settings |
| `ADMIN_EMAIL` | Optional operator email; must match a verified Access identity |

The first two variables enable Access only when LINE Login is not configured. Missing or invalid configuration for both providers makes protected account APIs return HTTP 503 with `auth_not_configured`. When a provider is configured, unauthenticated requests return HTTP 401. In Access mode, sign-in goes to the Access-protected `/studio`; sign-out goes to `/cdn-cgi/access/logout`.

The Worker removes incoming `oai-authenticated-*` headers, verifies the Cloudflare Access user JWT signature, issuer, audience, and expiry, and supplies only the verified identity to the application. Supplying those identity headers yourself does not log in. Local development also has no automatic customer-login bypass.

`ADMIN_EMAIL` does not create an account or bypass login. The first eligible operator request binds the verified, stable Access user identity in `hub_operators`. Changing the email variable later does not transfer that existing operator binding. Accounts from the original hosting environment are not automatically linked to Access identities; any such migration requires an explicit account-mapping process.

## User-facing routes

| Route | Purpose |
| --- | --- |
| `/` | NAKNA HUB product landing page and visual examples |
| `/studio` | Signed-in workspace, page editor, preview, Pro analytics, account settings, and billing |
| `/admin` | Separate operator dashboard: platform metrics, accounts, hubs, publication controls, support notes, and audit history |
| `/h/:slug` | The currently published customer page |
| `/go/:slug/:linkId` | Record an eligible click and redirect to the destination in the published snapshot |
| `/media/:id` | Serve an authorized uploaded avatar |

Customer passwords are not stored by this application. LINE Login authenticates customers, with the optional Access fallback described above; published hub visitors do not need accounts.

## Daily LINE reports

Reports require current paid Pro access and are off for new accounts. In **บัญชีและ LINE**, an eligible connected customer adds the Official Account as a friend, chooses a time in 15-minute increments, enables reports, and saves. The default is 09:00 Asia/Bangkok. Each report covers the previous complete Thai calendar day across that customer's hubs: view events, click events, click change from the preceding day, the three most-clicked links, and the busiest click hour. Counts are events, not unique people. A zero-activity day remains explicit rather than fabricating insights. Expiry pauses reporting while preserving the stored preference; opting out remains available without Pro.

`LINE_DIGEST_ENABLED=true` is a separate platform gate; it is absent/off by default. A quarter-hour Cron Trigger calls the Worker scheduled handler. A durable D1 outbox allows one daily report per account/date, immutable payloads, leased sends, persisted LINE retry keys, and bounded retries within 23 hours. Each tick handles at most 100 queued deliveries with five concurrent pushes; larger populations can be processed on subsequent ticks. It is not a promise of exact-time delivery or unlimited sending capacity. Monitor D1/Worker limits and LINE message quota as the service grows.

The preview uses real account-scoped analytics without sending anything. A test send requires a separate confirmation and the preview's report date, is limited to once per minute per account, and does not enable daily reports. The server chooses the verified account's recipient; the browser cannot supply a LINE user ID or message body. A stale preview is rejected before consuming the test-send allowance.

Webhook requests are HMAC-verified using their original bytes before JSON parsing. Follow/unfollow events update friendship state with deduplication and timestamp ordering; the webhook does not send messages. Opting out or unfollowing cancels pending daily deliveries, and each send rechecks eligibility. A request already accepted by LINE cannot be recalled. An accepted API response means LINE accepted the request, not that the customer received or read it. See the setup guide for quota and operational checks.

## API routes

| Method | Route | Authorization and behavior |
| --- | --- | --- |
| GET | `/api/auth/config` | Public provider availability and local URLs; no credentials |
| GET | `/auth/line/start`, `/auth/line/callback` | Browser-bound LINE OAuth flow at the Worker entry |
| POST | `/auth/logout` | Same-origin session revocation and cookie clearing |
| GET | `/api/workspace` | Current account, explicit entitlements, summaries, usage, and limits; protected counters are null without paid access |
| GET | `/api/slugs?slug=...` | Signed-in slug validation and availability |
| POST | `/api/pages` | Create a draft page within the customer's page quota |
| GET / PATCH / DELETE | `/api/pages/:id` | Owner-only read, draft update or restoration, and page archival |
| POST | `/api/pages/:id/links` | Owner-only link or heading creation |
| PATCH / DELETE | `/api/pages/:id/links/:linkId` | Owner-only block update, restoration, or archival |
| POST | `/api/pages/:id/reorder` | Owner-only complete block ordering |
| POST | `/api/pages/:id/publish` | Owner-only publication of the current draft as one snapshot |
| POST | `/api/pages/:id/unpublish` | Owner-only removal of the public snapshot |
| GET | `/api/pages/:id/analytics?range=...` | Paid Pro + page-owner analytics for `today`, `7d`, `30d`, or `all` |
| GET | `/api/pages/:id/export?range=...` | Paid Pro + page-owner CSV export for the same reporting range |
| POST | `/api/uploads` | Signed-in avatar upload, attributed to the current account |
| POST | `/api/account/upgrade` | Legacy manual upgrade request; does not charge or grant Pro |
| GET | `/api/billing` | Current account's billing availability and subscription |
| POST | `/api/billing/checkout` | Create/reuse an authenticated Stripe subscription checkout |
| POST | `/api/billing/portal` | Open the current customer's Stripe portal |
| POST | `/api/billing/sync` | Reconcile current Stripe state after checkout/portal return |
| POST | `/api/billing/webhook` | Signature-verified Stripe events; no customer session required |
| GET | `/api/operator?range=...` | Operator-only platform metrics, date series, leading hubs, and estimated paid subscription value |
| GET | `/api/operator/accounts?q=...&plan=...&page=...` | Operator-only searchable, paginated accounts and billing status |
| PATCH | `/api/operator/accounts/:id` | Operator-only support note update or upgrade-request resolution; plan changes are rejected |
| GET | `/api/operator/hubs?q=...&status=...&page=...` | Operator-only searchable, paginated hubs |
| PATCH | `/api/operator/hubs/:id` | Operator-only suspension/restoration with a required reason and atomic audit entry |
| GET | `/api/operator/audit?page=...` | Operator-only action history |
| GET / PATCH | `/api/line/settings` | Current customer's connection, opt-in, and send time |
| GET | `/api/line/preview` | Paid Pro customer's previous-day report; does not send |
| POST | `/api/line/test` | Confirmed test for the paid Pro account; requires `{ "reportDate": "YYYY-MM-DD" }` |
| POST | `/api/line/webhook` | Signed LINE follow/unfollow events; no customer session required |
| GET | `/api/hubs/:slug` | Published profile and blocks; no draft or private account data |
| POST | `/api/events` | Same-origin page-view event for an existing published page |

All state-changing customer and operator APIs enforce a same-origin request check. Account creation on first authenticated access is idempotent and keyed by the trusted user ID.

## Ownership and data model

| Table | Responsibility |
| --- | --- |
| `hub_accounts` | One independent customer account per verified provider identity, with display identity and plan |
| `hub_pages` | Account-owned slug, draft profile, draft revision, publication state, and current published snapshot |
| `hub_links` | Page-owned link and heading blocks, ordering, enabled state, and archive state |
| `hub_events` | Page/link click events and page-view events |
| `hub_assets` | Account-owned avatar metadata and private R2 object key |
| `hub_upgrade_requests` | Legacy manual Pro request and resolution state |
| `hub_billing_accounts` | Stripe customer binding, checkout reuse and concurrency lock |
| `hub_billing_subscriptions` | Verified subscription status and paid entitlement end |
| `hub_billing_webhook_events` | Processed Stripe event IDs |
| `hub_operators` | Bound platform-operator identity |
| `hub_page_controls` | Reversible operator publication restrictions, separate from drafts and snapshots |
| `hub_account_support` | Private operator support notes |
| `hub_operator_audit` | Operator actions, targets, reasons, and timestamps |
| `hub_line_auth_attempts` | Expiring, single-use browser-bound OAuth attempts |
| `hub_line_sessions` | Hashed opaque login sessions bound to origin and Login channel |
| `hub_line_connections` | Verified LINE user ID and timestamped friendship state |
| `hub_line_preferences` | Per-account opt-in, Thai send time, and test-send cooldown |
| `hub_line_deliveries` | Durable message outbox, retry keys, leases, and acceptance status |
| `hub_line_webhook_receipts` | Deduplication of signed follow/unfollow events |

Management reads and writes first resolve the account from the authenticated identity and then verify page ownership. Link queries additionally constrain the page ID. Analytics and CSV require both ownership and a current paid entitlement; changing an ID in a URL does not grant access. Operators can read platform statistics and manage publication/support records. Ordinary page-editing APIs still require the page owner; operators cannot grant paid access through the application. See [Owner dashboard operations](docs/OWNER_ADMIN_TH.md).

Legacy `deal_*` tables remain intact for migration continuity. They are not customer templates, account seeds, or the active data source for NAKNA HUB. New customer accounts start with an empty workspace. Landing-page examples are presentation fixtures, not customer analytics.

## Drafts and publishing

Draft profile and block edits do not change the currently published page. Publishing validates enabled link destinations and writes the profile and blocks into a single snapshot, guarded by the draft revision. At least one enabled link is required. The public page, its metadata, the public API, and click redirects all read published data.

`/h/:slug` is rendered dynamically. The server passes only the public DTO to the client: page ID, slug, published profile and blocks, publication time, and an owner boolean for that request. It does not serialize customer email, user ID, plan data, or draft fields. The client can load the same public DTO when server data is unavailable.

Slugs use lowercase English letters, digits, and internal hyphens, with 3–40 characters. Reserved names are rejected and global uniqueness is enforced in the database. A published page must be unpublished before changing its slug; the write also checks publication state to prevent a concurrent publish from bypassing this restriction.

Archiving a block changes the draft while preserving the existing public snapshot until the next publish. Archiving a page immediately unpublishes it and clears its public snapshot, while retaining its draft rows and event history. Restoration is subject to the current plan quota and does not automatically publish the page. Archived page slugs remain reserved.

## Plans and quota enforcement

| Limit | Starter | Pro |
| --- | --- | --- |
| Unarchived pages per account | 1 | 10 |
| Unarchived blocks per page | 5 | 100 |
| 24 ready-made themes, layouts, profile styling, avatar, link icons/images | Included | Included |
| Analytics, rankings, source/device breakdown, and CSV | Locked; events are still collected | Included |
| Daily LINE analytics report | Locked | Included with LINE setup, friendship, and opt-in |
| Hide NAKNA HUB footer branding | No | Yes |

Blocks include both links and headings. Disabled blocks still count until archived; draft pages count toward the page limit. Quotas are enforced in server-side SQL when creating or restoring data, not only by disabled UI controls. Link updates use a draft-revision guard to reject stale writes.

Stripe-managed expiry locks analytics and CSV, pauses LINE reports, and restores Starter and public branding when the paid entitlement ends, even if the account contains more pages or links. Existing content and published snapshots are preserved; creation and restoration still enforce Starter limits. Starter branding is enforced when reading public data, even if an older Pro snapshot hid it. The public terms describe this preservation policy.

Analytics access requires a Pro account, a managed Stripe billing record, and a live `active` or `past_due` subscription with a verified `paid_until` in the future. Cancellation at period end retains access through the paid window. A manually edited plan, test-mode subscription, unpaid trial, or Checkout success URL does not grant access. Protected customer APIs return HTTP 403 with `analytics_pro_required`; workspace/editor counters return null. LINE preview, test, queue creation, and dispatch enforce the same entitlement. Collected events are retained for a future upgrade.

## Avatars and media access

Customers can upload PNG, JPEG, or WebP avatars up to 2 MiB per file. The server checks the upload size, declared MIME type, and file signature, then stores the object under an account-specific R2 key. Draft uploaded media is readable by its owning account. Other visitors can read uploaded media only while a currently published, unarchived, unsuspended page from that account references it in its snapshot. Media responses use `Cache-Control: no-store`.

Profile validation prevents one account from assigning another account's private `/media/:id` asset. External avatar URLs must use HTTPS. Link destinations allow HTTP, HTTPS, and validated `mailto:` URLs; dangerous schemes, embedded credentials, local hostnames, and literal private-network IP addresses are rejected.

## Analytics semantics

Counts are events, not unique people. Eligible clicks are written to D1 before redirect; a temporary analytics-write failure does not prevent navigation. The redirect target comes from the published snapshot and cannot be changed merely by editing a draft. View event UUIDs deduplicate retries.

Owner requests, HEAD requests, detected automated agents, and declared prefetch/prerender requests are excluded. Event rows store the page ID, optional link ID, timestamp, coarse device class, and source category. They do not store visitor identity, email, IP address, full user agent, or full referring URL. Customer account identity is stored separately for authentication and management.

All reporting ranges use Asia/Bangkok (UTC+7). Today starts at local midnight; the 7-day and 30-day ranges include today. Archived blocks retain their event history. Rankings display each block's current title and preserve its stable ID. CSV uses the same reporting query, includes a UTF-8 BOM, and escapes text that could be interpreted as a spreadsheet formula. New accounts have no historical imported analytics.

## Verification and release limits

The standalone pipeline is validated with the pinned dependencies: native Vinext build, Wrangler deployment dry-run, D1 migrations, and local runtime checks. Authentication, account isolation, report calculations, retry behavior, and webhook processing also have automated tests using mocked LINE HTTP responses. These checks do not validate real channel credentials or prove a real message was delivered. Verify a real LINE sign-in, add-friend flow, one explicitly requested test report, and the next scheduled opt-in report on the final hostname after configuration.

The public landing-page examples are design fixtures, not live customer statistics. Checkout and recurring billing are implemented and require the configured Stripe runtime. LINE channel availability controls who can authorize the app; the application creates an independent account on first verified use and does not provide customer passwords. Message delivery requires provider resources, runtime configuration, paid Pro access, friendship, and customer opt-in.

The old screenshot reference `docs/nakna-hub-homepage.jpg` is absent from this repository, so no image preview is embedded here. This has no effect on the app's `public/` assets or its build.

## Official documentation

- [Cloudflare Vite plugin: build and deployment](https://developers.cloudflare.com/workers/vite-plugin/get-started/)
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Wrangler custom build command](https://developers.cloudflare.com/workers/wrangler/custom-builds/)
- [Wrangler automatic configuration and how to skip it](https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Validate Cloudflare Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Integrating LINE Login](https://developers.line.biz/en/docs/line-login/integrate-line-login/)
- [Linking a LINE Official Account](https://developers.line.biz/en/docs/line-login/link-a-bot/)
- [LINE user IDs and providers](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/)
- [LINE Messaging API retries](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
- [LINE webhook signatures](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- [LINE Messaging API pricing](https://developers.line.biz/en/docs/messaging-api/pricing/)

### Ready-made theme collection

The Studio Design tab offers 24 original presets across glass, minimal, bold, elegant, playful, and nature collections. Selecting a preset previews its complete palette, surfaces, borders, layout, and decoration with the customer’s own content. Save creates a draft; publishing uses the existing snapshot workflow. Theme selection preserves identity, uploaded media, links, and branding entitlement.

Presets live in `lib/hub-themes.ts`. The optional validated `profile.themeId` is stored in the existing profile/snapshot JSON, so no migration is required. Missing or `custom` IDs retain the previous appearance. Both the public hub and Studio preview use the same renderer; palette-only card thumbnails never load analytics. Advanced background or light/dark changes switch back to custom, while accent and layout can refine a preset. All decorative artwork is authored CSS with no third-party wallpapers, logos, or image dependencies.

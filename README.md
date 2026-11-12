# นากนะ HUB

A multi-customer link hub product under the NAKNA brand, using the primary color `#04878a`. Each signed-in customer owns an independent account, creates branded pages, edits drafts, publishes selected versions, and reads their own click analytics. The landing page presents the product; customer pages use `/h/:slug`.

## Standalone Cloudflare deployment

This repository targets **Cloudflare Workers with Vinext**, D1, and R2. Start with [คู่มือเริ่มต้นภาษาไทย](GITHUB_START_HERE_TH.md). The root `wrangler.jsonc` and `vite.config.ts` are the deployment configuration; this build does not require `.openai/hosting.json` or the original hosting platform.

The public landing page and published customer hubs can run without an authentication provider. **Management remains blocked until Cloudflare Access is configured.** Cloudflare Zero Trust/Access setup is not completed by installing this repository or deploying the Worker. A successfully built public page does not demonstrate a working customer login.

Starter and Pro limits are implemented. **There is no paid checkout, payment collection, recurring subscription, or payment-provider integration yet.** Customers request Pro; the platform operator grants or removes it manually. A request does not charge the customer or automatically change their plan.

### Runtime and resources

- Node.js >= 22.13.0; install the committed dependency versions with `npm ci`.
- Vinext / React builds a native Worker using `@cloudflare/vite-plugin`. Keep `package-lock.json` committed.
- D1 binding `DB` uses `nakna-hub-db`; R2 binding `BUCKET` uses `nakna-hub-assets`. `wrangler.jsonc` records the D1 ID for the current account. Change it when deploying to a different account.
- Drizzle schema is in `db/schema.ts`; versioned SQL migrations are in `drizzle/`. Apply the migrations to the target D1 database before serving database-backed requests.
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
npm run build
npm run preview
```

For the first remote deployment, authenticate Wrangler to the intended Cloudflare account, ensure the configured D1 database and R2 bucket exist, then run:

```sh
npm run db:migrate:remote
npm run deploy
```

The remote migration command writes schema changes to the configured D1 database. It does not copy customer data from another deployment. If applying SQL through the D1 dashboard console, run the committed migrations in filename order and keep the migration ledger consistent before later switching to Wrangler migrations.

Other commands: `npm run lint`, `npm run db:generate`, `npm run test:auth`. `npm run start` is an alias for the local production preview; it does not deploy.

### Authentication and operator setup

Create a Cloudflare Access **self-hosted application** for the management paths on the actual deployment hostname. Use one application/AUD for `/studio*`, `/admin*`, `/api/workspace*`, `/api/slugs*`, `/api/pages*`, `/api/uploads*`, `/api/account*`, and `/api/operator*`. Set its access policy to the people allowed to manage accounts. Keep `/`, `/h/*`, `/go/*`, `/media/*`, `/api/hubs/*`, and `/api/events` publicly reachable; the application still controls private-media access itself. Protecting the entire hostname would also require visitors to sign in to public hubs.

Set these Worker runtime variables after creating the Access application:

| Variable | Value and purpose |
| --- | --- |
| `CF_ACCESS_TEAM_DOMAIN` | `https://<your-team>.cloudflareaccess.com`; the Access issuer |
| `CF_ACCESS_AUD` | The application's AUD tag, a 64-character value copied from its settings |
| `ADMIN_EMAIL` | Optional operator email; must match a verified Access identity |

The first two variables are optional for deploying the public site but required to enable management. Missing or invalid authentication configuration makes protected account APIs return HTTP 503 with `auth_not_configured`. When configured, a request without a valid user JWT is unauthorized (HTTP 401). Sign-in goes to the Access-protected `/studio`; sign-out goes to `/cdn-cgi/access/logout`.

The Worker removes incoming `oai-authenticated-*` headers, verifies the Cloudflare Access user JWT signature, issuer, audience, and expiry, and supplies only the verified identity to the application. Supplying those identity headers yourself does not log in. Local development also has no automatic customer-login bypass.

`ADMIN_EMAIL` does not create an account or bypass login. The first eligible operator request binds the verified, stable Access user identity in `hub_operators`. Changing the email variable later does not transfer that existing operator binding. Accounts from the original hosting environment are not automatically linked to Access identities; any such migration requires an explicit account-mapping process.

## User-facing routes

| Route | Purpose |
| --- | --- |
| `/` | NAKNA HUB product landing page and visual examples |
| `/studio` | Signed-in workspace, page editor, preview, analytics, account plans, and operator panel when authorized |
| `/admin` | Compatibility redirect to `/studio` |
| `/h/:slug` | The currently published customer page |
| `/go/:slug/:linkId` | Record an eligible click and redirect to the destination in the published snapshot |
| `/media/:id` | Serve an authorized uploaded avatar |

Customer passwords are not stored by this application. Cloudflare Access authenticates management users; published hub visitors do not need accounts.

## API routes

| Method | Route | Authorization and behavior |
| --- | --- | --- |
| GET | `/api/workspace` | Current customer's account, page summaries, usage, plan limits, and upgrade-request status |
| GET | `/api/slugs?slug=...` | Signed-in slug validation and availability |
| POST | `/api/pages` | Create a draft page within the customer's page quota |
| GET / PATCH / DELETE | `/api/pages/:id` | Owner-only read, draft update or restoration, and page archival |
| POST | `/api/pages/:id/links` | Owner-only link or heading creation |
| PATCH / DELETE | `/api/pages/:id/links/:linkId` | Owner-only block update, restoration, or archival |
| POST | `/api/pages/:id/reorder` | Owner-only complete block ordering |
| POST | `/api/pages/:id/publish` | Owner-only publication of the current draft as one snapshot |
| POST | `/api/pages/:id/unpublish` | Owner-only removal of the public snapshot |
| GET | `/api/pages/:id/analytics?range=...` | Owner-only analytics for `today`, `7d`, `30d`, or `all` |
| GET | `/api/pages/:id/export?range=...` | Owner-only CSV export for the same reporting range |
| POST | `/api/uploads` | Signed-in avatar upload, attributed to the current account |
| POST | `/api/account/upgrade` | Record the current customer's request for manual Pro access |
| GET | `/api/operator` | Operator-only account summaries and upgrade requests |
| PATCH | `/api/operator/accounts/:id` | Operator-only manual plan change |
| GET | `/api/hubs/:slug` | Published profile and blocks; no draft or private account data |
| POST | `/api/events` | Same-origin page-view event for an existing published page |

All state-changing customer and operator APIs enforce a same-origin request check. Account creation on first authenticated access is idempotent and keyed by the trusted user ID.

## Ownership and data model

| Table | Responsibility |
| --- | --- |
| `hub_accounts` | One independent customer account per verified Access user identity, with display identity and plan |
| `hub_pages` | Account-owned slug, draft profile, draft revision, publication state, and current published snapshot |
| `hub_links` | Page-owned link and heading blocks, ordering, enabled state, and archive state |
| `hub_events` | Page/link click events and page-view events |
| `hub_assets` | Account-owned avatar metadata and private R2 object key |
| `hub_upgrade_requests` | Manual Pro request and resolution state |
| `hub_operators` | Bound platform-operator identity |

Management reads and writes first resolve the account from the authenticated identity and then verify page ownership. Link queries additionally constrain the page ID. Analytics and CSV require the same ownership check; changing an ID in a URL does not grant access. Operator permissions cover the platform summary and plan changes; ordinary page-editing APIs still require the page owner.

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
| Unarchived blocks per page | 20 | 100 |
| Layouts, profile styling, avatar, and analytics | Included | Included |
| Hide NAKNA HUB footer branding | No | Yes |

Blocks include both links and headings. Disabled blocks still count until archived; draft pages count toward the page limit. Quotas are enforced in server-side SQL when creating or restoring data, not only by disabled UI controls. Link updates use a draft-revision guard to reject stale writes.

A Pro-to-Starter change requires no more than one unarchived page and no more than 20 blocks in both its draft and any live published snapshot. The downgrade check and account-plan update share one SQL statement. Starter branding is enforced when reading public data, even if an older Pro snapshot hid it.

## Avatars and media access

Customers can upload PNG, JPEG, or WebP avatars up to 2 MiB per file. The server checks the upload size, declared MIME type, and file signature, then stores the object under an account-specific R2 key. Draft uploaded media is readable by its owning account. Other visitors can read an uploaded avatar only while a currently published, unarchived page from that account references it in its snapshot. Media responses use `Cache-Control: no-store`.

Profile validation prevents one account from assigning another account's private `/media/:id` asset. External avatar URLs must use HTTPS. Link destinations allow HTTP, HTTPS, and validated `mailto:` URLs; dangerous schemes, embedded credentials, local hostnames, and literal private-network IP addresses are rejected.

## Analytics semantics

Counts are events, not unique people. Eligible clicks are written to D1 before redirect; a temporary analytics-write failure does not prevent navigation. The redirect target comes from the published snapshot and cannot be changed merely by editing a draft. View event UUIDs deduplicate retries.

Owner requests, HEAD requests, detected automated agents, and declared prefetch/prerender requests are excluded. Event rows store the page ID, optional link ID, timestamp, coarse device class, and source category. They do not store visitor identity, email, IP address, full user agent, or full referring URL. Customer account identity is stored separately for authentication and management.

All reporting ranges use Asia/Bangkok (UTC+7). Today starts at local midnight; the 7-day and 30-day ranges include today. Archived blocks retain their event history. Rankings display each block's current title and preserve its stable ID. CSV uses the same reporting query, includes a UTF-8 BOM, and escapes text that could be interpreted as a spreadsheet formula. New accounts have no historical imported analytics.

## Verification and release limits

The standalone pipeline has been checked locally with the pinned dependencies: native Vinext build, Wrangler deployment dry-run, fresh D1 migrations, public page rendering, page/link publication, and persisted click analytics. A dry-run does not deploy the Worker or validate the account's Access policy. Verify a real sign-in, ownership isolation, uploads, and an anonymous published-page visit on the final hostname after configuring Access.

The public landing-page examples are design fixtures, not live customer statistics. Checkout and recurring billing remain unimplemented. Access policies decide who can enter management; the application does not provide a separate open-registration or customer-password flow.

The old screenshot reference `docs/nakna-hub-homepage.jpg` is absent from this repository, so no image preview is embedded here. This has no effect on the app's `public/` assets or its build.

## Official documentation

- [Cloudflare Vite plugin: build and deployment](https://developers.cloudflare.com/workers/vite-plugin/get-started/)
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Wrangler custom build command](https://developers.cloudflare.com/workers/wrangler/custom-builds/)
- [Wrangler automatic configuration and how to skip it](https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Validate Cloudflare Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

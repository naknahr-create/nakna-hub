# นากนะ HUB

A multi-customer link hub product under the NAKNA brand, using the primary color `#04878a`. Each signed-in customer owns an independent account, creates branded pages, edits drafts, publishes selected versions, and reads their own click analytics. The landing page presents the product; customer pages use `/h/:slug`.

## Current access and commercial status

The Site is currently **owner-private** at the Sites access layer. Publishing a page inside the application creates its published snapshot; it does not change the Site audience. Anonymous visitors can reach published customer pages only after the Site owner explicitly opens the outer Sites audience. Customer management and operator APIs remain authenticated and authorized after that change.

Starter and Pro limits are implemented in the application. **There is no paid checkout, payment collection, recurring subscription, or payment-provider integration yet.** A customer can request Pro, and the platform operator can grant or remove the plan manually. Requesting Pro does not charge the customer and does not automatically change their plan.

## Runtime and configuration

- Vinext / React runs on a Cloudflare Worker.
- Sites provisions the D1 binding `DB` and R2 binding `BUCKET` declared in `.openai/hosting.json`.
- Drizzle schema is in `db/schema.ts`; versioned SQL migrations are in `drizzle/`. Apply them through the Sites release workflow.
- `ADMIN_EMAIL` is a protected Sites runtime environment variable used to establish the platform operator. The first eligible operator request binds the stable Sites user ID in `hub_operators`.
- Sites supplies the trusted `oai-authenticated-*` identity headers. These headers must not be trusted from arbitrary clients when running outside that gateway. Keep production secrets out of the repository.

Local commands available in this repository:

```sh
npm run dev
npm run build
npm run start
npm run lint
npm run db:generate
```

`npm run start` serves the built Worker locally with local persistent state; it does not publish a Site. The managed execution environment supplies the runtime configuration required by the Sites tooling.

## User-facing routes

| Route | Purpose |
| --- | --- |
| `/` | NAKNA HUB product landing page and visual examples |
| `/studio` | Signed-in workspace, page editor, preview, analytics, account plans, and operator panel when authorized |
| `/admin` | Compatibility redirect to `/studio` |
| `/h/:slug` | The currently published customer page |
| `/go/:slug/:linkId` | Record an eligible click and redirect to the destination in the published snapshot |
| `/media/:id` | Serve an authorized uploaded avatar |

The Sites gateway provides `/signin-with-chatgpt` and `/signout-with-chatgpt`; the application uses its verified identity rather than storing customer passwords.

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
| `hub_accounts` | One independent customer account per stable Sites user ID, with display identity and plan |
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

## Verification status

The current V2 production build passed TypeScript and 36 acceptance checks against its actual Worker output in isolated Miniflare with freshly migrated D1 and R2. Coverage includes account isolation, draft/public snapshot consistency, private uploads, click event behavior, exports, atomic quotas, plan changes, concurrent slug/publication behavior, and archive discovery/restoration. The test fixtures are not deployed.

Browser review covered the landing page on desktop and 360/390 px viewports, template switching, and the real unauthenticated studio entry. Studio layout and interactions were reviewed with a clearly labeled temporary, in-memory local fixture: onboarding, inline link editing, draft/publish controls, mobile analytics, and preview. The temporary routes were removed before the final build. This does not claim an authenticated production customer session was tested.

![NAKNA HUB landing page](docs/nakna-hub-homepage.jpg)

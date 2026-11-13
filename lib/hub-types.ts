import type {PageAccess} from './hub-team-types';
export type HubPlan = 'starter' | 'pro';
export type HubTemplate = 'creator' | 'business' | 'shop';
export type AnalyticsRange = 'today' | '7d' | '30d' | 'all';
export type HubProfile = {
  name: string;
  handle: string;
  tagline: string;
  bio: string;
  avatarUrl: string;
  accent: string;
  theme: 'light' | 'dark';
  layout: 'stack' | 'grid' | 'editorial';
  background: 'sand' | 'mint' | 'lavender' | 'ink';
  showBranding: boolean;
};
export type HubLink = {
  id: string;
  type: 'link' | 'heading';
  title: string;
  description: string;
  url: string;
  icon: string;
  enabled: boolean;
  featured: boolean;
  sortOrder: number;
  archived: boolean;
};
export type PageSummary = {
  id: string;
  slug: string;
  title: string;
  profile: HubProfile;
  published: boolean;
  suspended: boolean;
  suspensionReason: string | null;
  archived: boolean;
  updatedAt: number;
  publishedAt: number | null;
  linkCount: number;
  totalClicks: number | null;
  totalViews: number | null;
  hasUnpublishedChanges: boolean;
  access?: PageAccess;
};
export type HubAccount = {id: string; displayName: string; email: string; plan: HubPlan; isOperator?: boolean; entitlements: {analytics: boolean; lineDigest: boolean}};
export type PlanLimits = {maxPages: number; maxLinksPerPage: number};
export type WorkspaceData = {
  account: HubAccount;
  limits: PlanLimits;
  pages: PageSummary[];
  archivedPages: PageSummary[];
  sharedPages: PageSummary[];
  usage: {pages: number; links: number; totalClicks: number | null};
  upgradeRequested: boolean;
};
export type PageEditorData = {page: PageSummary; profile: HubProfile; links: HubLink[]; revision: number; access: PageAccess};
export type PublicHubData = {pageId: string; slug: string; profile: HubProfile; links: HubLink[]; publishedAt: number; isOwner: boolean};
export type AnalyticsData = {
  pageId: string;
  range: AnalyticsRange;
  totalClicks: number;
  totalViews: number;
  /** Click events / page-view events × 100; may exceed 100, not unique-person CTR. */
  clickRate: number | null;
  activeLinks: number;
  ranking: Array<{id: string; title: string; url: string; icon: string; enabled: boolean; archived: boolean; clicks: number; share: number; clickRate: number | null}>;
  daily: Array<{date: string; clicks: number; views: number}>;
  devices: Array<{name: string; count: number}>;
  sources: Array<{name: string; count: number}>;
  selectedLink?: {
    id: string; title: string; url: string; icon: string;
    clicks: number; share: number; clickRate: number | null;
    daily: Array<{date: string; clicks: number}>;
    devices: Array<{name: string; count: number}>;
    sources: Array<{name: string; count: number}>;
  };
};
export type OperatorData = {
  accounts: Array<{id: string; displayName: string; email: string; plan: HubPlan; pageCount: number; totalClicks: number; upgradeRequested: boolean; createdAt: number}>;
  totals: {accounts: number; pages: number; totalClicks: number; upgradeRequests: number};
};


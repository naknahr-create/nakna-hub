import type {HubPlan} from './hub-types';

export type AdminRange = 'today' | '7d' | '30d' | 'all';
export type AdminSubscription = {status: string; interval: 'month' | 'year'; paidUntil: number; cancelAtPeriodEnd: boolean} | null;
export type AdminAccount = {
  id: string; displayName: string; email: string; plan: HubPlan; analyticsAccess: boolean;
  pageCount: number; publishedPages: number; totalViews: number; totalClicks: number;
  createdAt: number; upgradeRequested: boolean; supportNote: string;
  subscription: AdminSubscription;
};
export type AdminHub = {
  id: string; accountId: string; accountName: string; slug: string; title: string;
  published: boolean; archived: boolean; suspended: boolean; suspensionReason: string | null;
  totalViews: number; totalClicks: number; createdAt: number; updatedAt: number;
};
export type AdminAudit = {
  id: string; actorName: string; action: 'suspend_hub' | 'restore_hub' | 'update_account_note' | 'resolve_upgrade_request';
  targetId: string; targetLabel: string; reason: string; createdAt: number;
};
export type AdminOverview = {
  range: AdminRange; from: number; to: number;
  totals: {accounts: number; starterAccounts: number; paidAccounts: number; pages: number; publishedPages: number;
    suspendedPages: number; views: number; clicks: number; newAccounts: number; upgradeRequests: number;
    estimatedMrr: number; monthlySubscriptions: number; yearlySubscriptions: number};
  daily: Array<{date: string; views: number; clicks: number; newAccounts: number; newPages: number}>;
  topHubs: Array<{id: string; slug: string; title: string; accountName: string; views: number; clicks: number}>;
  recentAudit: AdminAudit[];
};
export type AdminList<T> = {items: T[]; total: number; page: number; pageSize: number};
// GET /api/operator?range=7d -> AdminOverview
// GET /api/operator/accounts?q=&plan=all|starter|pro&page=1 -> AdminList<AdminAccount>
// GET /api/operator/hubs?q=&status=all|published|draft|archived|suspended&page=1 -> AdminList<AdminHub>
// GET /api/operator/audit?page=1 -> AdminList<AdminAudit>
// PATCH /api/operator/accounts/:id {supportNote: string} OR {resolveUpgradeRequest: true}
// PATCH /api/operator/hubs/:id {suspended: boolean, reason: string} -> {ok: true}

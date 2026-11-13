CREATE TABLE IF NOT EXISTS hub_teams (
 id TEXT PRIMARY KEY NOT NULL,
 owner_account_id TEXT NOT NULL REFERENCES hub_accounts(id),
 name TEXT NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS hub_teams_owner_idx ON hub_teams(owner_account_id,archived);
CREATE TABLE IF NOT EXISTS hub_team_pages (
 team_id TEXT NOT NULL REFERENCES hub_teams(id),
 page_id TEXT NOT NULL REFERENCES hub_pages(id),
 PRIMARY KEY(team_id,page_id)
);
CREATE INDEX IF NOT EXISTS hub_team_pages_page_idx ON hub_team_pages(page_id,team_id);
CREATE TABLE IF NOT EXISTS hub_team_invites (
 id TEXT PRIMARY KEY NOT NULL,
 team_id TEXT NOT NULL REFERENCES hub_teams(id),
 token_hash TEXT NOT NULL UNIQUE,
 role TEXT NOT NULL CHECK(role IN ('editor','viewer')),
 can_publish INTEGER NOT NULL DEFAULT 0 CHECK(can_publish IN (0,1)),
 created_by TEXT NOT NULL REFERENCES hub_accounts(id),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 claimed_account_id TEXT REFERENCES hub_accounts(id),
 claimed_at INTEGER,
 revoked_at INTEGER,
 CHECK(role='editor' OR can_publish=0)
);
CREATE INDEX IF NOT EXISTS hub_team_invites_team_idx ON hub_team_invites(team_id,created_at);
CREATE TABLE IF NOT EXISTS hub_team_members (
 id TEXT PRIMARY KEY NOT NULL,
 team_id TEXT NOT NULL REFERENCES hub_teams(id),
 account_id TEXT NOT NULL REFERENCES hub_accounts(id),
 invite_id TEXT NOT NULL REFERENCES hub_team_invites(id),
 role TEXT NOT NULL CHECK(role IN ('editor','viewer')),
 can_publish INTEGER NOT NULL DEFAULT 0 CHECK(can_publish IN (0,1)),
 status TEXT NOT NULL CHECK(status IN ('pending','active','revoked')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(team_id,account_id),
 CHECK(role='editor' OR can_publish=0)
);
CREATE INDEX IF NOT EXISTS hub_team_members_account_idx ON hub_team_members(account_id,status,team_id);
CREATE TABLE IF NOT EXISTS hub_team_audit (
 id TEXT PRIMARY KEY NOT NULL,
 team_id TEXT NOT NULL REFERENCES hub_teams(id),
 page_id TEXT REFERENCES hub_pages(id),
 actor_account_id TEXT NOT NULL REFERENCES hub_accounts(id),
 actor_name TEXT NOT NULL,
 action TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS hub_team_audit_team_idx ON hub_team_audit(team_id,created_at);
ALTER TABLE hub_assets ADD COLUMN page_id TEXT REFERENCES hub_pages(id);
CREATE INDEX IF NOT EXISTS hub_assets_page_idx ON hub_assets(page_id);

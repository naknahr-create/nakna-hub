declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ADMIN_EMAIL?: string;
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
    APP_ORIGIN?: string;
    LINE_LOGIN_CHANNEL_ID?: string;
    LINE_LOGIN_CHANNEL_SECRET?: string;
    LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?: string;
    LINE_MESSAGING_CHANNEL_SECRET?: string;
    LINE_OFFICIAL_ACCOUNT_URL?: string;
    LINE_DIGEST_ENABLED?: string;
    ADMIN_LINE_USER_ID?: string;
  }
}

import { accessConfiguration, authenticateAccessRequest } from './cloudflare-access';
import { lineConfiguration, authenticateLineRequest } from './line-auth';

export type AuthEnvironment = Cloudflare.Env;
export type HubAuthConfiguration = {
  provider: 'line' | 'access' | 'none';
  configured: boolean;
  signInUrl: string | null;
  signOutUrl: string;
  signOutMethod: 'POST' | 'GET';
  message?: string;
};

// LINE is the primary customer login. Access is retained only as an explicit
// fallback for installations that have not configured LINE; identities never mix.
export function getAuthConfiguration(env: AuthEnvironment): HubAuthConfiguration {
  if (lineConfiguration(env)) return {
    provider: 'line', configured: true,
    signInUrl: '/auth/line/start?returnTo=%2Fstudio',
    signOutUrl: '/auth/logout', signOutMethod: 'POST',
  };
  if (accessConfiguration(env)) return {
    provider: 'access', configured: true, signInUrl: '/studio',
    signOutUrl: '/cdn-cgi/access/logout', signOutMethod: 'GET',
  };
  return {
    provider: 'none', configured: false, signInUrl: null,
    signOutUrl: '/auth/logout', signOutMethod: 'POST',
    message: 'กำลังเตรียมการเข้าสู่ระบบด้วย LINE กรุณากลับมาอีกครั้งหลังผู้ดูแลเชื่อมบัญชีเรียบร้อย',
  };
}

export async function authenticateHubRequest(request: Request, env: AuthEnvironment): Promise<Request> {
  if (lineConfiguration(env)) return authenticateLineRequest(request, env);
  return authenticateAccessRequest(request, env);
}

import {env} from 'cloudflare:workers';
import {api, HubError, json, requireAccount, sameOrigin} from './hub-data';
import {buildDigestReport, getLineSettings, LineDigestError, sendLineTest, updateLineSettings} from './line-digest';
import {handleLineWebhook} from './line-webhook';

function guarded(run: () => Promise<Response>): Promise<Response> {
  return api(async () => {
    try { return await run(); } catch (error) {
      if (error instanceof LineDigestError) throw new HubError(error.status, error.message, {code: error.code});
      throw error;
    }
  });
}
async function settingsBody(request: Request): Promise<unknown> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) throw new HubError(415, 'กรุณาส่งข้อมูลในรูปแบบ JSON');
  const reader = request.body?.getReader();
  if (!reader) throw new HubError(400, 'ข้อมูลไม่ครบ');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); throw new HubError(413, 'ข้อมูลมีขนาดใหญ่เกินไป'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HubError(400, 'รูปแบบข้อมูลไม่ถูกต้อง'); }
}
export function lineSettingsGet(request: Request): Promise<Response> {
  return guarded(async () => { const account = await requireAccount(request); return json(await getLineSettings(env, account.id)); });
}
export function lineSettingsPatch(request: Request): Promise<Response> {
  return guarded(async () => {
    sameOrigin(request);
    const account = await requireAccount(request);
    return json(await updateLineSettings(env, account.id, await settingsBody(request)));
  });
}
export function linePreviewGet(request: Request): Promise<Response> {
  return guarded(async () => { const account = await requireAccount(request); return json(await buildDigestReport(env, account.id)); });
}
export function lineTestPost(request: Request): Promise<Response> {
  return guarded(async () => {
    sameOrigin(request);
    const account = await requireAccount(request);
    const input = await settingsBody(request);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'reportDate')) throw new HubError(400, 'กรุณายืนยันวันที่สรุปจากตัวอย่างล่าสุด');
    return json(await sendLineTest(env, account.id, (input as {reportDate?: unknown}).reportDate));
  });
}
export function lineWebhookPost(request: Request): Promise<Response> {
  return api(() => handleLineWebhook(request, env));
}

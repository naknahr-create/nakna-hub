import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,copyFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('build metadata is regenerated from the deployed source version, commit and UTC time', async t=>{
  const root=await mkdtemp(join(tmpdir(),'nakna-hub-build-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'scripts'));
  await mkdir(join(root,'lib'));
  await copyFile(fileURLToPath(new URL('../scripts/generate-build-info.mjs',import.meta.url)),join(root,'scripts/generate-build-info.mjs'));
  await writeFile(join(root,'package.json'),JSON.stringify({version:'2.7.4'}));
  const sha='a'.repeat(40);
  execFileSync(process.execPath,[join(root,'scripts/generate-build-info.mjs')],{
    cwd:root,encoding:'utf8',
    env:{...process.env,CF_PAGES_COMMIT_SHA:'',GITHUB_SHA:sha,COMMIT_SHA:''}
  });
  const source=await readFile(join(root,'lib/build-info.generated.ts'),'utf8');
  const marker='export const BUILD_INFO = ';
  const info=JSON.parse(source.slice(source.indexOf(marker)+marker.length,source.lastIndexOf(' as const;')));
  assert.equal(info.version,'2.7.4');
  assert.equal(info.commit,sha);
  assert.match(info.buildId,/^a{12}-\d{14}$/);
  assert.ok(Number.isFinite(Date.parse(info.builtAt)));
});

test('version endpoint does not cache live deployment information', async ()=>{
  const route=await readFile(new URL('../app/api/version/route.ts',import.meta.url),'utf8');
  assert.match(route,/dynamic='force-dynamic'/);
  assert.match(route,/no-store/);
  assert.match(route,/BUILD_INFO/);
});

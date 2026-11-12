# เริ่มต้น — นากนะ HUB บน GitHub และ Cloudflare

ชุดนี้เป็นแอปรวมลิงก์หลายบัญชี มี Studio, หน้าเผยแพร่ `/h/:slug`, สถิติคลิก, อันดับลิงก์, รูปโปรไฟล์ และแพ็กเกจ Starter/Pro ใช้ **Vinext + Cloudflare Workers + D1 + R2**

**สถานะการเข้าสู่ระบบ:** โค้ดรองรับ Cloudflare Access แต่ยังต้องตั้งค่า Zero Trust/Access ในบัญชี Cloudflare ก่อนใช้ Studio และ API จัดการบัญชี ถ้ายังไม่ตั้งค่า ระบบจะปิดการจัดการไว้ ส่วนหน้าสาธารณะทำงานได้เมื่อ Worker และฐานข้อมูลพร้อม

## 1. ตรวจไฟล์ใน GitHub

ให้ไฟล์ที่แตกจาก ZIP อยู่ที่ระดับรากของ repository ไม่ใช่อัป ZIP ไว้ไฟล์เดียว และต้องมีรายการเหล่านี้ครบ:

- `package.json`, `package-lock.json`, `wrangler.jsonc`, `vite.config.ts`
- `app/`, `lib/`, `components/`, `worker/`, `public/`
- `db/index.ts`, `db/schema.ts` และ `drizzle/` ทั้งโฟลเดอร์
- `.gitignore`, `.npmrc`, `components.json` และไฟล์ตั้งค่าอื่นที่มากับซอร์ส

บน macOS กด **Command + Shift + .** เพื่อแสดงไฟล์ที่ซ่อน ชุด standalone นี้ไม่ต้องใช้ `.openai/hosting.json` ส่วน `SOURCE_VERSION.txt` ระบุที่มาของชุด export เดิม ให้ใช้ประวัติ commit ของ GitHub เพื่อตรวจการแก้ไขภายหลัง

## 2. ตั้งค่า Workers Builds

ใช้ค่าปัจจุบันของ Worker `nakna-hub` ได้เลย:

| ช่อง | ค่า |
| --- | --- |
| Root directory | รากของ repository |
| Build command | เว้นว่าง |
| Deploy command | `npx wrangler deploy` |
| Worker name | `nakna-hub` ให้ตรงกับ `wrangler.jsonc` |

คำสั่ง deploy จะเรียก `npm run build` ผ่าน config ของ Wrangler ก่อนนำ Worker ขึ้นทุกครั้ง ทั้งครั้งแรกและครั้งถัดไป Build script ลบเฉพาะไฟล์ redirect ชั่วคราวที่ Vite สร้างหลังตรวจว่าชี้ไป output ของโปรเจกต์ เพื่อให้การ deploy ครั้งถัดไปกลับมา build จากซอร์สล่าสุด

ถ้าต้องการแยกสองขั้นตอนใน Workers Builds ให้ใช้ **Build command: `npm run build`** และ **Deploy command: `npm run deploy:cloudflare`** คู่นี้ใช้ได้เช่นกันและไม่ build ซ้ำในขั้น deploy

ใช้ Node.js >= 22.13.0 และ dependency ตาม `package-lock.json` หลัง build จะได้ `dist/server/wrangler.json` พร้อมไฟล์เว็บใน `dist/client` ไฟล์ `wrangler.jsonc` ทำให้ Wrangler รู้จัก Worker ของโปรเจกต์ ไม่ต้องตรวจจับเป็น Next.js แล้วติดตั้ง OpenNext ใหม่ จึงไม่จำเป็นต้องแก้ด้วย `--force` หรือ `--legacy-peer-deps`

## 3. ฐานข้อมูลและรูปอัปโหลด

`wrangler.jsonc` กำหนดทรัพยากรดังนี้:

| Binding | ทรัพยากร |
| --- | --- |
| `DB` | D1 ชื่อ `nakna-hub-db` และ database ID ของบัญชีนี้ |
| `BUCKET` | R2 ชื่อ `nakna-hub-assets` |

ถ้าติดตั้งในบัญชีอื่น ให้สร้าง D1/R2 ของบัญชีนั้นและแก้ชื่อ/ID ให้ตรงก่อน deploy ฐานข้อมูลใหม่ต้องใช้ migrations ก่อนเปิดใช้งาน:

```bash
npm ci
npx wrangler login
npm run db:migrate:remote
```

คำสั่งสุดท้ายเปลี่ยน schema ของ D1 จริงตาม config ไม่ใช่ฐานข้อมูล local ถ้าใช้ D1 Console ให้รัน SQL ใน `drizzle/` ตามลำดับชื่อไฟล์ และจัดการประวัติ migration ให้สอดคล้องก่อนกลับมาใช้คำสั่ง Wrangler

การนำซอร์สขึ้นโฮสต์ใหม่ไม่ย้ายข้อมูลบัญชี สถิติ หรือรูปของลูกค้าจากโฮสต์เดิมให้อัตโนมัติ

## 4. เปิดใช้งาน Studio ด้วย Cloudflare Access

สร้าง **Self-hosted application** ใน Cloudflare Zero Trust/Access บน hostname ที่ใช้งานจริง ใช้ application/AUD เดียวกันสำหรับ:

```text
/studio*          /admin*
/api/workspace*   /api/slugs*       /api/pages*
/api/uploads*     /api/account*     /api/operator*
```

กำหนด policy ว่าใครเข้าสู่ระบบได้ และเปิดหน้าสาธารณะไว้: `/`, `/h/*`, `/go/*`, `/media/*`, `/api/hubs/*`, `/api/events` ถ้าป้องกันทั้ง hostname ผู้ชมหน้ารวมลิงก์ก็จะถูกบังคับให้เข้าสู่ระบบด้วย

จากนั้นตั้ง **runtime variables ของ Worker** ใน Settings → Variables and Secrets:

| ตัวแปร | ค่าที่ต้องใส่ |
| --- | --- |
| `CF_ACCESS_TEAM_DOMAIN` | `https://ชื่อทีม.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | AUD ของ Access application จำนวน 64 ตัวอักษร |
| `ADMIN_EMAIL` | อีเมลผู้ดูแลที่ยืนยันผ่าน Access แล้ว ถ้าต้องการเปิดแผง operator |

การใส่ตัวแปรใน Build environment อย่างเดียวไม่พอ ตัว Worker ต้องอ่านได้ตอนรับ request ด้วย `keep_vars: true` ใน config ช่วยคงค่าที่ตั้งผ่าน dashboard ระหว่าง deploy

เมื่อยังไม่ได้ตั้ง Access API จัดการบัญชีตอบ `503 / auth_not_configured`; เมื่อตั้งแล้วแต่ไม่มี JWT ที่ถูกต้องจะตอบ `401` ปุ่มเข้าสู่ระบบไป `/studio` และออกจากระบบผ่าน `/cdn-cgi/access/logout` โค้ดตรวจลายเซ็นและข้อมูลใน JWT และไม่เชื่อ header ยืนยันตัวตนที่ผู้เข้าชมส่งมาเอง

`ADMIN_EMAIL` ใช้ผูกผู้ดูแลครั้งแรกหลังยืนยันตัวตน ไม่ใช่รหัสผ่าน และเปลี่ยนอีเมลตัวแปรภายหลังจะไม่ย้ายสิทธิ์ที่ผูกไว้แล้ว บัญชีจากระบบโฮสต์เดิมไม่ถูกจับคู่กับบัญชี Access โดยอัตโนมัติ

## 5. รันในเครื่องหรือ deploy จาก Terminal

```bash
npm ci
npm run db:migrate:local
npm run dev
```

ดู production build ในเครื่อง:

```bash
npm run build
npm run preview
```

Deploy จาก Terminal หลังเตรียม D1/R2 และ migrations แล้ว:

```bash
npm run deploy
```

Dev ไม่มีการข้ามระบบ login อัตโนมัติ จึงต้องทดสอบการเข้าสู่ระบบจริงบน hostname ที่ตั้ง Access แล้ว เมื่อ deploy เสร็จ ให้ลองเข้าสู่ Studio, สร้างและเผยแพร่หน้า, เปิดหน้านั้นแบบไม่เข้าสู่ระบบ, คลิกลิงก์ และตรวจอันดับคลิก

## ขอบเขตของชุดนี้

- Pro ยังเป็นการเปิดสิทธิ์ด้วยผู้ดูแล ไม่มี checkout หรือตัดเงินรายเดือนอัตโนมัติ
- สถิติเป็นจำนวน event ไม่ใช่จำนวนคนไม่ซ้ำ และตัวอย่างบนหน้าแรกไม่ใช่สถิติลูกค้าจริง
- ไม่มี secrets, ฐานข้อมูลลูกค้า, รูปอัปโหลด, `node_modules` หรือ build output ในชุดซอร์ส
- เป็นแอปที่มี backend ใช้ GitHub Pages แบบ static อย่างเดียวไม่ได้
- ภาพคู่มือเดิม `docs/nakna-hub-homepage.jpg` ไม่ได้อยู่ใน repository และไม่จำเป็นต่อการ build

รายละเอียดฟีเจอร์ โควตา API และข้อมูลที่จัดเก็บอยู่ใน [README.md](README.md)

### เอกสารอ้างอิง

[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [Wrangler custom build](https://developers.cloudflare.com/workers/wrangler/custom-builds/) · [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/get-started/) · [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) · [Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) · [การตรวจ Access JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

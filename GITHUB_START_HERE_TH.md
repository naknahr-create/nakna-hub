# เริ่มต้น — นากนะ HUB บน GitHub และ Cloudflare

ชุดนี้เป็นแอปรวมลิงก์หลายบัญชี มี Studio, หน้าเผยแพร่ `/h/:slug`, สถิติคลิก, อันดับลิงก์, รูปโปรไฟล์ และแพ็กเกจ Starter/Pro ใช้ **Vinext + Cloudflare Workers + D1 + R2**

**สถานะการเข้าสู่ระบบ:** โค้ดรองรับ **LINE Login** เป็นช่องทางหลัก พร้อมสรุปสถิติรายวันผ่าน LINE Official Account ลูกค้าเลือกเปิดรับเองได้ ต้องเชื่อม LINE channels และตั้งค่า runtime ก่อนใช้จริง ดู [คู่มือเชื่อม LINE](docs/LINE_SETUP_TH.md) ถ้ายังไม่ตั้งค่าผู้ให้บริการเข้าสู่ระบบ ระบบจะปิดการจัดการไว้ ส่วนหน้าสาธารณะทำงานได้เมื่อ Worker และฐานข้อมูลพร้อม

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

## 4. เปิดใช้งาน Studio และรายงานผ่าน LINE

ทำตาม [คู่มือเชื่อม LINE](docs/LINE_SETUP_TH.md) ซึ่งแยกการเข้าสู่ระบบออกจากการรับข้อความ:

1. ใช้ LINE Login channel และ Messaging API channel ภายใต้ **Provider เดียวกัน** เพื่อให้ LINE user ID ตรงกัน
2. ใช้ migration `0002_line_login_and_reports.sql` ก่อนเปิดฟีเจอร์ ถ้าฐานข้อมูลเดิมเคยใช้ D1 Console ให้ตรวจ ledger ก่อนใช้คำสั่ง migrations ซ้ำ
3. ตั้ง callback ของ LINE Login เป็น `https://nakna-hub.nakna.workers.dev/auth/line/callback`
4. ตั้ง runtime variables/secrets ของ Worker สำหรับ LINE Login แล้วตรวจการเข้าสู่ระบบจริง
5. เชื่อม Official Account กับ Login channel ตั้ง webhook เป็น `https://nakna-hub.nakna.workers.dev/api/line/webhook` และเปิดรับ webhook
6. ตั้ง Messaging API secrets และเปิด `LINE_DIGEST_ENABLED=true` หลังเตรียมระบบครบ ลูกค้ายังต้องเปิดรับสรุปเองใน **บัญชีและ LINE**

ค่าเริ่มต้นคือ **09:00 น. เวลาไทย สรุปข้อมูลของเมื่อวาน** เปลี่ยนเวลาได้ทุก 15 นาที และปิดรับได้ทุกเมื่อ การกดดูตัวอย่างไม่ส่งข้อความ การส่งทดสอบต้องกดยืนยันอีกครั้งและไม่เปิดสรุปรายวันเอง

ตัวแปรต้องเป็น **runtime variables/secrets ของ Worker** ใน Settings → Variables and Secrets ไม่ใช่ใส่เฉพาะ Build environment `keep_vars: true` ใน config ช่วยคงค่าที่ตั้งผ่าน dashboard ระหว่าง deploy ห้าม commit channel secret หรือ access token ลง GitHub

Cloudflare Access ยังคงเป็นทางเลือกสำหรับการติดตั้งที่ไม่ได้ตั้ง LINE Login เท่านั้น รายละเอียดอยู่ใน [README](README.md#authentication-and-operator-setup) เมื่อตั้ง LINE Login แล้ว ไม่ต้องสร้าง Access application เพิ่ม บัญชี LINE กับบัญชี Access เดิมจะไม่รวมกันด้วยอีเมลโดยอัตโนมัติ

## 5. รันในเครื่องหรือ deploy จาก Terminal

```bash
npm ci
npm run db:migrate:local
npm run dev
```

ดู production build ในเครื่อง:

```bash
npm run db:migrate:local
npm run build
npm run preview
```

Preview ใช้ฐานข้อมูล local ใน `.wrangler/state` เดียวกับคำสั่ง migrations แม้ config ที่ build แล้วจะอยู่ใน `dist/server/`

Deploy จาก Terminal หลังเตรียม D1/R2 และ migrations แล้ว:

```bash
npm run deploy
```

Dev ไม่มีการข้ามระบบ login อัตโนมัติ ทดสอบระบบ auth และรายงานแบบไม่ส่งข้อความจริงได้ด้วย `npm run test:auth` และ `npm run test:line` หลังเชื่อม LINE จริงแล้ว ให้ลองเข้าสู่ Studio, สร้างและเผยแพร่หน้า, เปิดหน้านั้นแบบไม่เข้าสู่ระบบ, คลิกลิงก์ และตรวจอันดับคลิก จากนั้นเจ้าของบัญชีจึงยืนยันส่งรายงานทดสอบ 1 ข้อความจากหน้าบัญชี

## ขอบเขตของชุดนี้

- Pro ยังเป็นการเปิดสิทธิ์ด้วยผู้ดูแล ไม่มี checkout หรือตัดเงินรายเดือนอัตโนมัติ
- สถิติเป็นจำนวน event ไม่ใช่จำนวนคนไม่ซ้ำ และตัวอย่างบนหน้าแรกไม่ใช่สถิติลูกค้าจริง
- รายงาน LINE ใช้โควตาข้อความของ Official Account ต้องตั้งช่องทางจริงและตรวจโควตาก่อนเปิดบริการ การ deploy โค้ดไม่สร้างบัญชี LINE ให้โดยอัตโนมัติ
- ไม่มี secrets, ฐานข้อมูลลูกค้า, รูปอัปโหลด, `node_modules` หรือ build output ในชุดซอร์ส
- เป็นแอปที่มี backend ใช้ GitHub Pages แบบ static อย่างเดียวไม่ได้
- ภาพคู่มือเดิม `docs/nakna-hub-homepage.jpg` ไม่ได้อยู่ใน repository และไม่จำเป็นต่อการ build

รายละเอียดฟีเจอร์ โควตา API และข้อมูลที่จัดเก็บอยู่ใน [README.md](README.md)

### เอกสารอ้างอิง

[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) · [LINE Login](https://developers.line.biz/en/docs/line-login/integrate-line-login/) · [เชื่อม Official Account](https://developers.line.biz/en/docs/line-login/link-a-bot/) · [โควตา Messaging API](https://developers.line.biz/en/docs/messaging-api/pricing/)

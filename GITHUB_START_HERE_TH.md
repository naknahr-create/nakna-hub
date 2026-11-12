# เริ่มต้น — นากนะ HUB สำหรับ GitHub

ชุดนี้คือซอร์สโค้ดเวอร์ชันเดียวกับเว็บไซต์ นากนะ HUB ที่เผยแพร่ล่าสุดเมื่อ 12 พฤศจิกายน 2569
ประกอบด้วยหน้าขาย, หน้าลูกค้า, Studio, API, สถิติคลิก, บัญชี/แพ็กเกจ, schema และ migrations ของฐานข้อมูล

## นำเข้า GitHub

1. แตกไฟล์ ZIP จะได้โฟลเดอร์ `nakna-hub`
2. นำไฟล์และโฟลเดอร์ทั้งหมดภายใน `nakna-hub` เข้า repository ของคุณ
3. ให้ `package.json`, `package-lock.json`, `app/`, `public/` และ `README.md` อยู่ที่ระดับรากของ repository
4. รวมไฟล์/โฟลเดอร์ตั้งค่า `.gitignore`, `.npmrc` และ `.openai/` ด้วย บน macOS กด Command + Shift + . เพื่อแสดงไฟล์ที่ซ่อน
5. หากต้องการให้ GitHub เห็นและใช้งาน source ให้ส่งไฟล์ที่แตกแล้ว ไม่ใช่เก็บ ZIP เป็นไฟล์เดียวใน repository

ใช้ Git จากโฟลเดอร์ที่แตกแล้วได้เช่นกัน (แทน YOUR_GITHUB_REPOSITORY_URL ด้วย URL repository จริงของคุณ):

```bash
git init -b main
git add .
git commit -m "Import NAKNA HUB source"
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

## ไฟล์สำคัญ

- `app/` — หน้าเว็บและ API
- `lib/hub-data.ts` — ข้อมูล, สิทธิ์บัญชี, โควตา, การเผยแพร่ และสถิติ
- `db/` และ `drizzle/` — schema และ migration ของฐานข้อมูล
- `public/` — โลโก้และฟอนต์
- `scripts/`, `worker/`, `vite.config.ts` — เครื่องมือ build และ runtime
- `.openai/hosting.json` — การผูก Sites กับ D1/R2; project_id เป็นตัวระบุโครงการเดิม ไม่ใช่รหัสลับ
- `README.md` — สถาปัตยกรรม ฟีเจอร์ และรายละเอียดระบบ
- `SOURCE_VERSION.txt` — เวอร์ชัน source ของชุดนี้

## รันและนำขึ้นโฮสต์

โค้ดใช้ Node.js >= 22.13.0, React/Vinext และ Cloudflare Worker พร้อม D1 (`DB`) และ R2 (`BUCKET`)
รายการคำสั่ง build/dev อยู่ใน `package.json` และ README

การอัปขึ้น GitHub เป็นการเก็บซอร์สโค้ด ยังไม่ย้ายหรือเปิดเว็บไซต์ให้อัตโนมัติ
แอปนี้มี backend และฐานข้อมูล จึงต้องมี runtime ที่รองรับเมื่อ deploy และใช้ GitHub Pages แบบ static เพียงอย่างเดียวไม่ได้

เวอร์ชันนี้ใช้ระบบเข้าสู่ระบบและ identity gateway ของ Sites (`/signin-with-chatgpt` และ trusted `oai-authenticated-*` headers)
หากจะย้ายไป Cloudflare ของตัวเอง ต้องกำหนด D1/R2, ใช้ migrations และเชื่อมระบบ login ที่ตรวจสอบตัวตนจริงก่อนเปิดให้ลูกค้าใช้งาน
ห้ามใช้ header ที่ผู้เข้าชมส่งมาเองเป็นหลักฐานยืนยันตัวตนโดยไม่มี gateway ที่เชื่อถือได้
ตั้ง `ADMIN_EMAIL` เป็น secret ในระบบโฮสต์ ไม่ใส่อีเมลผู้ดูแลหรือ credential จริงลงใน repository

ชุดนี้ไม่บรรจุ secrets, local database, uploads ของลูกค้า, node_modules, build output หรือข้อมูล QA
ไฟล์ SQL ที่รวมเป็น schema migrations ไม่ใช่การ export ข้อมูลลูกค้า
แพ็กเกจ Pro ยังเป็นการเปิดสิทธิ์โดยผู้ดูแล ยังไม่มี payment checkout หรือตัดเงินรายเดือนอัตโนมัติ

## สิ่งที่เพิ่มใน ZIP

ซอร์สแอปทุกไฟล์มาจาก commit ที่ระบุใน SOURCE_VERSION.txt โดยไม่แก้การทำงานของแอป
เพิ่มเฉพาะคู่มือ GITHUB_START_HERE_TH.md และ SOURCE_VERSION.txt เพื่อประกอบการส่งมอบ

# เชื่อม LINE Login และสรุปรายวัน — นากนะ HUB

โค้ดส่วนนี้เพิ่มการเข้าสู่ระบบด้วย LINE และรายงานสถิติผ่าน LINE Official Account แยกกัน ลูกค้าเข้าสู่ระบบได้โดยไม่ต้องเปิดรับข้อความ และเลือกเปิดหรือปิดรายงานได้ใน **สตูดิโอ → บัญชีและ LINE**

การ deploy โค้ดยังไม่สร้าง LINE channel หรือใส่ credentials ให้ ไม่ควรเปิดบริการส่งจนกว่าจะตั้งค่าตามขั้นตอนนี้และตรวจการเข้าสู่ระบบจริงแล้ว

## 1. เตรียม LINE ของนากนะ HUB

ใช้ LINE Official Account สำหรับนากนะ HUB และเปิดใช้ Messaging API ของบัญชีนั้น จากนั้นสร้าง LINE Login channel แบบ Web app ใน LINE Developers โดยให้ **ทั้งสอง channel อยู่ใต้ Provider เดียวกัน** LINE user ID จะตรงกันภายใน Provider เดียวกัน จึงส่งสรุปกลับไปหาคนที่ล็อกอินได้ ไม่ควรนำ tokens จากโปรเจกต์อื่นมาใช้แทน

ใน LINE Login channel:

- ตั้งชื่อและรูปของนากนะ HUB
- ตั้ง Callback URL ให้ตรงกับด้านล่างทุกตัวอักษร
- เชื่อม Linked LINE Official Account เป็นบัญชีเดียวกับ Messaging API channel
- ระหว่างทดสอบ ใช้บัญชีที่มีสิทธิ์ทดสอบ channel; ก่อนเปิดรับลูกค้าทั่วไป ตรวจสถานะ channel และข้อมูลบริการที่ LINE กำหนด

| รายการ | URL ของ deployment นี้ |
| --- | --- |
| เว็บไซต์ | `https://nakna-hub.nakna.workers.dev` |
| LINE Login callback | `https://nakna-hub.nakna.workers.dev/auth/line/callback` |
| Messaging API webhook | `https://nakna-hub.nakna.workers.dev/api/line/webhook` |
| หน้าตั้งค่ารับรายงาน | `https://nakna-hub.nakna.workers.dev/studio?section=account` |

หากเปลี่ยนโดเมน ให้ปรับ `APP_ORIGIN` ใน `wrangler.jsonc` รวมทั้ง callback และ webhook ของ LINE ให้ตรงกัน เซสชันผูกกับ origin และ Login channel จึงต้องเข้าสู่ระบบใหม่หลังเปลี่ยนค่า

## 2. อัปเดตฐานข้อมูลก่อนเปิดฟีเจอร์

Migration ใหม่คือ `drizzle/0002_line_login_and_reports.sql` เพิ่มตาราง OAuth attempts, sessions, LINE connections, preferences, delivery outbox และ webhook receipts รวม 6 ตาราง ไม่แก้ข้อมูลฮับเดิม

สำหรับฐานข้อมูลใหม่ หรือฐานข้อมูลที่มีประวัติ Wrangler migrations ถูกต้องแล้ว:

```sh
npm ci
npx wrangler d1 migrations list DB --remote --config wrangler.jsonc
npm run db:migrate:remote
```

**สำหรับฐานข้อมูล production เดิมที่ใช้ D1 Console:** ตารางของ `0000` และ `0001` ถูกสร้างแล้ว แต่ต้องตรวจว่า `d1_migrations` บันทึกสองไฟล์นี้ไว้ครบก่อนสั่ง apply ทั้งชุด ตรวจจาก `sqlite_master` ว่ามีตาราง ledger หรือไม่ แล้วเทียบชื่อไฟล์ใน ledger กับ schema จริง อย่ารัน SQL สร้างตารางเก่าซ้ำ หรือบันทึกว่าทำ migration แล้วโดยไม่ตรวจ schema หาก apply `0002` ผ่าน Console ให้บันทึก ledger ให้ตรงหลัง SQL สำเร็จด้วย

คำสั่ง `--remote` เปลี่ยนฐานข้อมูลจริง ใช้ ID ใน `wrangler.jsonc` ของ deployment ที่ต้องการ หากตรวจในเครื่องให้ใช้ `npm run db:migrate:local` แทน

## 3. ตั้ง runtime variables และ secrets

เปิด Cloudflare Worker **nakna-hub → Settings → Variables and Secrets** ใส่ค่าที่ runtime อ่านได้ ไม่ใช่เฉพาะใน Build environment

| ชื่อ | ชนิด | ความหมาย |
| --- | --- | --- |
| `APP_ORIGIN` | Variable | `https://nakna-hub.nakna.workers.dev` มีอยู่ใน config ของ repo แล้ว |
| `LINE_LOGIN_CHANNEL_ID` | Variable | Channel ID ของ **LINE Login** |
| `LINE_LOGIN_CHANNEL_SECRET` | Secret | Channel secret ของ **LINE Login** |
| `LINE_OFFICIAL_ACCOUNT_URL` | Variable | ลิงก์เพิ่มเพื่อนจริงจาก OA เช่น URL บน `https://lin.ee/…` หรือ `https://line.me/…` |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | Secret | Channel access token ของ **Messaging API** |
| `LINE_MESSAGING_CHANNEL_SECRET` | Secret | Channel secret ของ **Messaging API** สำหรับตรวจ webhook |
| `LINE_DIGEST_ENABLED` | Variable | ตั้ง `true` เมื่อพร้อมเปิดบริการส่ง; ถ้าไม่ตั้งหรือค่าอื่น ระบบไม่ส่ง |
| `ADMIN_LINE_USER_ID` | Variable, ไม่บังคับ | LINE user ID ของเจ้าของแพลตฟอร์ม จาก Provider นี้ รูปแบบ `U` ตามด้วยเลขฐานสิบหก 32 ตัว |

Secret ของ Login และ Messaging เป็นคนละค่า อย่าใส่สลับกัน เก็บใน Cloudflare Secrets โดยตรง ไม่ใส่ใน GitHub, `wrangler.jsonc`, screenshot สาธารณะ หรือข้อความแชต

`ADMIN_LINE_USER_ID` ใช้ระบุผู้ดูแลครั้งแรก ไม่ใช่รหัสเข้าสู่ระบบ ต้องล็อกอินได้จริงด้วย LINE ID ตรงกันก่อน ผู้ใช้คนแรกทั่วไปจะไม่ได้สิทธิ์ผู้ดูแลเอง ถ้ามี operator ผูกกับบัญชีเก่าอยู่แล้ว ต้องจัดการย้ายสิทธิ์อย่างชัดเจน การเปลี่ยนตัวแปรไม่ย้ายสิทธิ์เดิมอัตโนมัติ

## 4. เปิด webhook และเชื่อมเพื่อน

ใน Messaging API channel ตั้ง Webhook URL ตามตาราง แล้วใช้ Verify และเปิด Use webhook จุดรับ webhook ต้องเข้าถึงจาก LINE ได้โดยไม่มี Cloudflare Access login wall ระบบตรวจลายเซ็นด้วย Messaging channel secret ก่อนอ่านข้อมูล event

Webhook รับ follow/unfollow เพื่อให้รู้ว่าเพิ่มเพื่อนหรือบล็อกอยู่ รับ event ซ้ำได้โดยไม่ทำรายการซ้ำ และไม่ส่งข้อความตอบกลับเอง หากเพิ่มเพื่อนจากหน้าล็อกอิน ระบบตรวจ friendship เพิ่มให้อีกทางหนึ่ง การส่ง greeting/auto-reply ของ OA เป็นการตั้งค่าของ LINE แยกจากโค้ดนี้

ถ้าเคยใช้ Cloudflare Access ให้ปรับกฎเดิมก่อนเปลี่ยนเป็น LINE เพื่อไม่ให้บังคับลูกค้าเข้าสู่ Access ซ้อนอีกชั้น หรือปิดกั้น `/auth/line/*` และ `/api/line/webhook` เมื่อ LINE Login configured แล้ว แอปใช้เซสชัน LINE เป็นหลัก; Access เป็น fallback เฉพาะการติดตั้งที่ยังไม่ได้ตั้ง LINE

## 5. ประสบการณ์ของลูกค้า

1. กด **เข้าสู่ระบบด้วย LINE** และอนุญาตข้อมูลโปรไฟล์พื้นฐาน ไม่ต้องกรอกอีเมลหรือสร้างรหัสผ่านของ HUB
2. ระบบเปิดบัญชีฮับส่วนตัวของผู้ใช้ ไม่จับคู่บัญชีเก่าจากชื่อหรืออีเมล
3. สมัคร **Pro** และรอระบบยืนยันรอบชำระเงินจริง สิทธิ์ดูสถิติ CSV ตัวอย่างรายงาน และการส่งสรุป LINE ใช้เกณฑ์เดียวกัน
4. ไป **บัญชีและ LINE** เพิ่มเพื่อน OA หากยังไม่ได้เพิ่ม แล้วตรวจสถานะ
5. เลือก **รับสรุปรายวัน** เลือกเวลา และกด **บันทึกการตั้งค่า** ค่าเริ่มต้นคือ 09:00 น.
6. กดดูตัวอย่างจากข้อมูลจริงได้โดยไม่ส่ง หากต้องการทดสอบจะเห็นข้อความก่อน และต้องกด **ยืนยันส่ง 1 ข้อความ**

Starter ยังเข้าสู่ระบบด้วย LINE ได้ตามปกติและระบบเก็บยอดผู้เข้าชมต่อเนื่อง แต่การดูรายงานและรับสรุปต้องมี Pro ปัจจุบัน หน้าสมาชิกฟรีแสดงสิทธิ์ของ Pro และปุ่มอัปเกรด ไม่แสดงยอดศูนย์แทนข้อมูลที่ถูกล็อก

เวลารายงานใช้ Asia/Bangkok และเลือกได้ทุก 15 นาที รายงานครอบคลุม **เมื่อวาน 00:00–23:59 น.** เพื่อไม่ให้ยอดของวันยังไม่ครบ เช่น สรุปที่ส่งเช้าวันที่ 13 จะเป็นข้อมูลวันที่ 12 หากเปิดรับหรือเปลี่ยนเวลาหลังรอบของวันนั้น จะเริ่มรอบถัดไป

ข้อความรวมผลทุกฮับของบัญชีนั้น ได้แก่ ยอดเข้าชม ยอดคลิก การเปลี่ยนแปลงของคลิกจากวันก่อน 3 ลิงก์ที่ถูกคลิกมากที่สุด และช่วงชั่วโมงที่มีคลิกสูงสุด ไม่มีข้อมูลข้ามบัญชี และไม่แสดงยอดคลิกเป็นจำนวนคนไม่ซ้ำ

## 6. ตรวจใช้งานจริงก่อนเปิดให้ลูกค้า

หลัง migrations และ variables พร้อม ให้ deploy ตามปกติ แล้วตรวจว่า `/api/auth/config` ตอบ `provider: "line"` และ `configured: true` จุดนี้แสดงเฉพาะสถานะและ URL ภายใน ไม่แสดง secrets

ทดสอบด้วยบัญชีเจ้าของ: เข้าสู่ระบบ, เปิดหน้า Studio, สร้าง/เผยแพร่ฮับ, ออกจากระบบ และเข้าสู่ใหม่ จากนั้นใช้บัญชีที่มี Pro จากรอบชำระจริง ตรวจใน **บัญชีและ LINE** ว่าพร้อมใช้งานและเป็นเพื่อน OA กดดูตัวอย่าง แล้วเจ้าของบัญชียืนยันส่งทดสอบ 1 ข้อความด้วยตัวเอง การทดสอบนี้ใช้โควตาข้อความของ OA

ตรวจด้วย Starter หรือสมาชิกที่หมดระยะชำระแล้วว่า preview/test เปิดรับรายงาน และ API สถิติ/CSV ตอบ HTTP 403 `analytics_pro_required` โดยการปิดรับยังทำได้ การแก้ค่า plan เป็น Pro เองไม่ปลดล็อกสิทธิ์รายงาน

ทดสอบรอบอัตโนมัติด้วยบัญชี Pro โดยเปิดรับและเลือกเวลาถัดไป ให้เวลา Cron Trigger ของ Cloudflare เริ่มมีผล แล้วตรวจข้อความของรอบนั้น ค่าตารางเวลาใน config คือ `*/15 * * * *` จึงตรวจคิวทุก 15 นาที ไม่ได้สัญญาว่าถึงมือถือในวินาทีที่กำหนด

ชุดทดสอบอัตโนมัติใน repo ไม่แตะ LINE จริง:

```sh
npm run test:auth
npm run test:line
npx tsc --noEmit
npm run build
```

## 7. การส่งซ้ำ โควตา และปิดบริการ

ข้อความรายวันมีหนึ่งรายการต่อบัญชีและวันที่รายงานใน D1 ใช้ retry key เดิมและข้อความเดิมเมื่อ retry ป้องกันสอง cron ส่งงานเดียวกันพร้อมกัน หาก LINE รับคำขอไปแล้วแต่การตอบกลับขาดหาย ระบบตรวจการรับซ้ำด้วย retry key แทนสร้างข้อความใหม่

สถานะ “LINE รับคำขอส่งแล้ว” ไม่ได้ยืนยันว่าเจ้าของได้รับหรืออ่าน ข้อความทดสอบที่รอ retry จะแสดงสถานะรอ ไม่เปิดปุ่มยืนยันซ้ำจาก preview เดิม จำกัดการเริ่มทดสอบหนึ่งครั้งต่อนาทีต่อบัญชี และ preview ที่ข้ามวันไทยต้องโหลดใหม่ก่อนส่ง

ผู้ใช้ปิดรับรายงานได้ทุกเมื่อ งานรายวันที่ยัง pending/retry จะถูกยกเลิก การบล็อก OA ทำให้หยุดส่งด้วย ข้อความที่ LINE รับไปแล้วไม่สามารถเรียกคืนได้ หากต้องการหยุดระบบส่งทั้งหมด ให้เปลี่ยน `LINE_DIGEST_ENABLED` เป็น `false`; การเข้าสู่ระบบยังใช้ได้ และสมาชิก Pro ยังดูสถิติใน Studio ได้

ก่อนสร้างรายงานและก่อนส่งทุกครั้ง ระบบตรวจสิทธิ์รอบชำระ Pro ที่ยังมีผล (`active` หรือ `past_due` ที่ยังอยู่ใน paid_until และเป็น live subscription) เมื่อสิทธิ์สิ้นสุดจะไม่ส่งรายงานเพิ่ม การตั้งเวลาที่เคยสมัครรับไว้ยังอยู่ แต่แสดงว่า “พัก” จนกว่าจะกลับมามีสิทธิ์ ผู้ใช้ปิดการรับที่บันทึกไว้ได้แม้อยู่ Starter เพื่อไม่ให้กลับมาส่งเมื่ออัปเกรดอีกครั้ง

รายงานแบบ push ใช้โควตาของ LINE Official Account ต้องตรวจแผนและโควตาจริงก่อนกำหนดแพ็กเกจขาย ตัวอย่างการประมาณต้นทุน: 100 บัญชีที่เปิดรายงานทุกวันเป็นประมาณ 3,000 การส่งใน 30 วัน ก่อนนับข้อความทดสอบและข้อความอื่น นี่เป็นจำนวนประมาณเพื่อวางแผน ไม่ใช่ราคาแพ็กเกจของ LINE

คิวต่อรอบจำกัด 100 รายการ และส่งพร้อมกันสูงสุด 5 รายการ เมื่อผู้ใช้เพิ่มขึ้นต้องตรวจเวลารอคิว, D1/Worker limits และโควตา OA ประกอบกัน เก็บเฉพาะรหัสข้อผิดพลาดมาตรฐานในคิว ไม่เก็บ token หรือ raw response ของ LINE ใน log

## อ้างอิงจาก LINE

- [LINE Login integration](https://developers.line.biz/en/docs/line-login/integrate-line-login/)
- [PKCE](https://developers.line.biz/en/docs/line-login/integrate-pkce/)
- [การเชื่อม LINE Official Account กับ Login](https://developers.line.biz/en/docs/line-login/link-a-bot/)
- [LINE user ID และ Provider](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/)
- [การตรวจลายเซ็น webhook](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- [การ retry และข้อจำกัด retry key](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
- [โควตาและราคา Messaging API](https://developers.line.biz/en/docs/messaging-api/pricing/)

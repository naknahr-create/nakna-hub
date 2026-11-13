# แพ็กเกจและ Stripe — นากนะ HUB

## ราคาเปิดตัวและเหตุผลที่ซื้อ

| สิทธิ์ | Free (Starter) | Pro |
| --- | --- | --- |
| ราคา | 0 บาท | 149 บาท/เดือน หรือ 1,490 บาท/ปี |
| ฮับที่เปิดใช้งาน | 1 | 10 |
| ลิงก์และหัวข้อรวมต่อฮับ | 20 | 100 |
| ไอคอน รูป พรีวิว การแต่งหน้า | รวม | รวม |
| สถิติ กราฟ อันดับ อุปกรณ์ แหล่งที่มา CSV | ต้องอัปเกรด (ยังเก็บยอดไว้) | รวม |
| สรุปสถิติผ่าน LINE รายวัน | ต้องอัปเกรด | รวมเมื่อเชื่อม LINE และเปิดรับสรุป |
| ซ่อนโลโก้ ชื่อ และข้อความของแพลตฟอร์มที่ท้ายฮับ | ไม่ได้ | ได้ |

ราคาเป็นสมมติฐานสำหรับเปิดตัว ไม่ใช่ผลยืนยันว่าลูกค้ายอมจ่ายแล้ว จุดขายของ Pro คือการรู้ว่าลิงก์ไหนได้ผลจากสถิติจริง รับสรุปผ่าน LINE หน้าสาธารณะที่เป็นแบรนด์ลูกค้า และพื้นที่หลายฮับสำหรับหลายแบรนด์/สาขา/แคมเปญ ลูกค้าจ่ายเมื่อใช้ฮับเป็นหน้าร้านหรือผลงานจริง หรือเมื่อทำงานเกินหนึ่งฮับ ส่วน Free ให้ลองใช้งานหลักจนเกิดคุณค่าก่อนตัดสินใจอัปเกรด

รายปีเรียกเก็บ 1,490 บาทครั้งเดียว ประหยัด 298 บาทเทียบรายเดือน 12 รอบ (16.67%) เฉลี่ย 124.17 บาท/เดือน แต่ไม่ใช่การผ่อนรายเดือน ยังไม่ขายโดเมนส่วนตัวหรือบัญชีทีม ส่วน LINE สรุปรายวันรวมใน Pro โดยต้องเชื่อม LINE เพิ่มเพื่อนบัญชีทางการ และเปิดรับสรุปก่อน

## นโยบายสมาชิกที่โค้ดรองรับ

- ไม่มี trial ที่เปลี่ยนเป็นเก็บเงินโดยไม่ได้เลือกสมัคร ลูกค้าเลือกเดือน/ปีและยืนยันบน Stripe Checkout
- ตรวจการรับเงินจริงจากฝั่งเซิร์ฟเวอร์ก่อนให้ Pro ไม่เชื่อ `billing=success` หรือข้อมูลแพ็กเกจจากเบราว์เซอร์
- ต่ออายุตามรอบที่ลูกค้าเลือก ยกเลิกผ่าน Customer Portal โดยมีผลสิ้นรอบที่ชำระไว้
- เมื่อสิทธิ์ที่ชำระไว้สิ้นสุด แบรนด์แพลตฟอร์มกลับมาแสดงทันทีที่มีการอ่านข้อมูลฮับหรือบัญชี แม้ webhook ต่ออายุจะมาช้า
- ไม่ลบหรือ unpublish ข้อมูลเดิมอัตโนมัติเมื่อหมด Pro การสร้าง/กู้คืนรายการใหม่ยังต้องผ่านโควตา Free
- สิทธิ์ถูกตรวจบนเซิร์ฟเวอร์ รูปแบบปุ่มใน UI ไม่ใช่ตัวตัดสินสิทธิ์
- สถิติ, CSV และสรุป LINE ต้องมี Stripe subscription โหมด live ที่ชำระแล้วและยังไม่หมดสิทธิ์ ไม่ให้สิทธิ์จากการแก้ชื่อแพ็กเกจในฐานข้อมูลหรือ URL หลัง Checkout
- เมื่อหมด Pro สถิติจะล็อกและพักสรุป LINE แต่ยังเก็บยอดจริงต่อเนื่องเพื่อให้ดูย้อนหลังเมื่ออัปเกรดอีกครั้ง
- หลังบ้านเจ้าของระบบดูภาพรวมได้ด้วยสิทธิ์ operator ที่ผูกแยกไว้ ไม่เปลี่ยนแพ็กเกจของบัญชีเจ้าของหรือของลูกค้า
- Public terms: `/billing/terms`

## ก่อนเปิดรับเงินจริง

ต้องล็อกอิน Stripe บัญชีธุรกิจที่ถูกต้องและยืนยันว่าบัญชีนั้นเปิดใช้ Payments + Billing/Subscriptions ได้ รวมถึงทำข้อมูลธุรกิจ การยืนยันตัวตน และบัญชีรับเงินตามที่ Stripe กำหนด การมีโค้ด integration ไม่ยืนยันว่าบัญชีพร้อมรับเงินจริง

เอกสารการตลาด Stripe ประเทศไทยมีข้อความเรื่องความพร้อมของ Billing ที่ไม่สอดคล้องกัน ณ 13 พฤศจิกายน 2569 จึงต้องตรวจความสามารถในบัญชีจริงหรือสอบถาม Stripe ก่อนเปิด gate ห้ามสรุปว่าบัญชีไทยทุกบัญชีรองรับหรือไม่รองรับจาก banner เพียงอย่างเดียว

## 1. ฐานข้อมูล

ใช้ migration `drizzle/0003_stripe_billing.sql` **ก่อน deploy โค้ดนี้**:

```sh
npm run db:migrate:remote
```

เพิ่มเฉพาะ `hub_billing_accounts`, `hub_billing_subscriptions`, `hub_billing_webhook_events` และ indexes ไม่แก้รายการเงิน/ฮับเดิม หากใช้ D1 console ให้รันแต่ละ statement แล้วตรวจตาราง ก่อนบันทึกชื่อ migration ใน `d1_migrations` เพื่อให้ Wrangler ไม่รันซ้ำโดยไม่ทราบสถานะ

## 2. Product, Prices และ Portal

ในบัญชี Stripe ที่จะรับเงินจริง สร้าง Product **นากนะ HUB Pro** พร้อม recurring price สกุล THB สองรายการ:

| รอบ | Amount ใน API (สตางค์) | ราคาที่ลูกค้าเห็น |
| --- | --- | --- |
| month, interval_count=1 | 14900 | 149 บาท/เดือน |
| year, interval_count=1 | 149000 | 1,490 บาท/ปี |

ใช้ Price IDs จริงจากบัญชีนี้ ระบบตรวจ amount, currency, interval และโหมด live ก่อนเปิด Checkout อย่าสร้าง Price สำหรับบริการอื่นแล้วนำมาใช้กับ HUB

ต้องตั้ง Customer Portal configuration ของ HUB ให้ลูกค้าดูใบเสร็จ อัปเดตวิธีชำระเงิน และยกเลิกสมาชิกเมื่อสิ้นรอบได้ ระบบจะตรวจ configuration ก่อนสร้าง Checkout และ Portal ไม่เปิดการเปลี่ยนไป price/product อื่นผ่าน portal แบบกว้าง ๆ Return URL คือ `https://nakna-hub.nakna.workers.dev/studio?billing=portal`

## 3. Webhook

Endpoint:

```text
https://nakna-hub.nakna.workers.dev/api/billing/webhook
```

สมัคร events ของ Checkout, Subscription และ Invoice ที่ implementation รองรับ ดูรายการใน `lib/hub-billing.ts` โดยเฉพาะ `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` และ asynchronous Checkout success/failure หากเปิดใช้งาน

Webhook ต้องเข้าถึงโดยไม่มี Cloudflare Access login wall การยืนยันใช้ `Stripe-Signature` บน raw body ก่อนประมวลผล และบันทึก event ID เพื่อรองรับ delivery ซ้ำ ห้ามยกเว้นลายเซ็นเพื่อให้ปุ่มทดสอบผ่าน

## 4. Runtime configuration

ตั้งใน **Cloudflare Worker nakna-hub → Settings → Variables and Secrets**:

| ชื่อ | ประเภท | หน้าที่ |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Secret | คีย์ Stripe บัญชีรับเงิน แยกจาก frontend |
| `STRIPE_WEBHOOK_SECRET` | Secret | Signing secret ของ endpoint ข้างต้น |
| `STRIPE_PRICE_PRO_MONTHLY` | Variable | Price ID รายเดือน |
| `STRIPE_PRICE_PRO_YEARLY` | Variable | Price ID รายปี |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Variable | Portal configuration ของ HUB ที่เปิดยกเลิกสิ้นรอบ ดูใบเสร็จ และอัปเดตบัตร |
| `STRIPE_BILLING_ENABLED` | Variable | ใช้ `true` หลังตรวจบัญชีและ configuration ครบ |
| `APP_ORIGIN` | Variable ที่มีอยู่ | `https://nakna-hub.nakna.workers.dev` |

ไม่ใส่ secrets ใน GitHub, ZIP, screenshot หรือข้อความแชต คีย์และ webhook secret ต้องเป็นโหมดเดียวกัน ใช้ secret test กับ production ไม่ทำให้ได้รับ Pro จริง การปิด `STRIPE_BILLING_ENABLED` หยุดการเริ่มซื้อใหม่ แต่ไม่หยุดการคืนสิทธิ์เมื่อสมาชิกที่เคยชำระหมดอายุ

## 5. ตรวจการใช้งาน

ชุดทดสอบอัตโนมัติใช้ SQLite และ mock Stripe ไม่มีการหักเงินจริง:

```sh
node --experimental-strip-types --test tests/*.test.mjs
npx tsc --noEmit
npm run build
```

ชุดนี้ทดสอบผลชำระสำเร็จ การกลับมาโดยยังไม่จ่าย จ่ายล้มเหลว webhook ซ้ำ signature ผิด price ผิด cross-account และสิทธิ์หมดอายุด้วย mock Stripe และฐานข้อมูล SQLite จริง ตรวจการบังคับแบรนด์บนข้อมูลหน้าสาธารณะด้วย โค้ด production ปฏิเสธคีย์ test และไม่ให้ event โหมดทดสอบเปิดสิทธิ์ Pro การผ่านชุดทดสอบยังไม่ใช่หลักฐานว่าเชื่อมบัญชี Stripe จริงแล้ว ต้องตรวจ product/price/portal/webhook ของบัญชีที่จะเปิดบริการด้วย

การทดสอบตัดเงินจริงและการยอมรับข้อตกลง Stripe ต้องให้เจ้าของบัญชีดำเนินการหรือยืนยันตามขั้นตอนที่เกี่ยวข้อง ห้ามใช้การสร้างลูกค้าจริงหรือ subscription จริงเป็น smoke test โดยไม่ตั้งใจ

## ต้นทุนสำหรับเจ้าของบริการ

หน้าอัตรามาตรฐาน Stripe ไทยระบุบัตรในประเทศ 3.65% + 10 บาท/รายการ และหน้า Billing ระบุ 0.7% ของยอด Billing หากบัญชีรองรับและใช้อัตรานี้:

| รอบ | รายรับ | Payments + Billing โดยประมาณ | เหลือก่อนภาษีและต้นทุนอื่น |
| --- | ---: | ---: | ---: |
| เดือน | 149.00 | 16.48 | 132.52 |
| ปี | 1,490.00 | 74.82 | 1,415.18 |

ตัวเลขไม่รวม VAT บนค่าธรรมเนียม ภาษีของกิจการ บัตรต่างประเทศ FX dispute/refund ค่า Cloudflare หรือการสนับสนุนลูกค้า ตรวจอัตราจริงของบัญชีก่อนใช้ทำประมาณการ รายปีลดจำนวนรายการชำระและค่าธรรมเนียมคงที่ต่อผู้ใช้

แหล่งข้อมูล: [Stripe Thailand pricing](https://stripe.com/th/pricing), [Billing pricing](https://stripe.com/th/billing/pricing), [Subscriptions lifecycle](https://docs.stripe.com/billing/subscriptions/overview), [Cancel subscriptions](https://docs.stripe.com/billing/subscriptions/cancel), [PromptPay](https://docs.stripe.com/payments/promptpay)

PromptPay ไม่รองรับ Checkout `subscription` mode ตามเอกสาร Stripe จึงไม่ควรโฆษณาว่าต่ออายุอัตโนมัติผ่าน PromptPay โค้ดนี้ใช้ subscription ผ่านบัตร หากต้องการ QR ต่ออายุด้วยตนเองต้องออกแบบ prepaid one-time แยกต่างหาก

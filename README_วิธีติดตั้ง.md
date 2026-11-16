# นากนะ HUB — Gallery Full-Width Fix

แพ็กนี้เป็น **ไฟล์แก้ไขเฉพาะจุด** สำหรับโปรเจกต์ `naknahr-create/nakna-hub` ไม่ใช่โค้ดทั้งเว็บไซต์

## ปัญหาและต้นเหตุ

ภาพในหัวข้อ "ผลงานที่ผ่านมา" แสดงอยู่แค่ครึ่งซ้ายของการ์ด แม้เลือก "เลื่อนดูทีละรูป" และแสดงเวอร์ชันใหม่แล้ว

สาเหตุพบใน `app/components/HubContentBlock.tsx`: การ์ด Gallery ชั้นนอกมีคลาส `hcb-gallery` และตัวจัดรูปแบบ Grid ชั้นในก็ใช้คลาส `hcb-gallery` เหมือนกัน จึงถูก CSS `.hc .hcb-gallery { display: grid; grid-template-columns: repeat(2, ...) }` จัด **ทั้งตัวการ์ดชั้นนอก** เป็นสองคอลัมน์โดยไม่ตั้งใจ

## วิธีแก้บน GitHub (ง่ายที่สุด)

1. แตก ZIP นี้ก่อน (อย่าอัปโหลดไฟล์ `.zip` ตรง ๆ ไปเป็นโค้ดใน GitHub)
2. เปิด repo `naknahr-create/nakna-hub`
3. เปิดไฟล์ `app/components/HubContentBlock.tsx`
4. เลือก Edit แล้วแทนเนื้อหาทั้งไฟล์ด้วยไฟล์ชื่อเดียวกันใน ZIP นี้ หรือใช้ GitHub Desktop/VS Code เขียนทับตาม path นี้
5. Commit ไปที่ `main` ตาม workflow ของคุณ แล้วตรวจ Cloudflare Workers Builds ว่าผ่านหรือไม่
6. เปิด `/studio` ตรวจตัวอย่างมือถือ ทั้งแบบ Carousel และ Grid อีกครั้ง

ถ้ามี Git ในเครื่องแล้ว จะใช้ไฟล์ `gallery-fullwidth.patch` แทนก็ได้ (แก้เพียงหนึ่งบรรทัด):

```bash
git apply --check gallery-fullwidth.patch
git apply gallery-fullwidth.patch
git add app/components/HubContentBlock.tsx
git commit -m "fix: prevent gallery card from inheriting inner grid layout"
git push origin main
```

**ไฟล์ที่เปลี่ยน:** `app/components/HubContentBlock.tsx` เท่านั้น ไม่มีการแก้ฐานข้อมูล, Stripe, LINE, ข้อมูลลูกค้า หรือไฟล์รูป

**ผลที่ต้องได้:** Carousel แสดงภาพ 1:1 กว้างเต็มพื้นที่เนื้อหาการ์ด และ Grid แสดงรูป 2 คอลัมน์เต็มความกว้าง ไม่มีพื้นที่ว่างขนาดครึ่งการ์ดด้านขวา

**การตรวจสอบ:** ผ่านการตรวจไวยากรณ์ TSX ด้วย TypeScript compiler (transpile). ยังไม่ได้ทำ Production UI test บนเบราว์เซอร์หรือรัน Full Build จริง

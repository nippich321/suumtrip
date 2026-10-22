# สุ่มทริป

กล่องสุ่มทริป 2 วัน 1 คืน ลูกค้าเลือกหมวด (ทะเล / เมืองเก่า / ธรรมชาติ) วันที่ และวิธีเดินทาง จ่ายผ่าน QR พร้อมเพย์ แล้วเปิดกล่องเพื่อลุ้นปลายทาง จากนั้นได้แผนเที่ยวครบทุกช่วง พร้อมแผนที่ 2.5D ที่มีตัวละคร 3D เดินหรือนั่งรถไปตามถนนจริง

ผลงานสายแข่งขัน Software Development "Make Me Money" ของ All for One University

## โครงสร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html`, `css/style.css` | หน้าเว็บ (หน้าเดียว เปลี่ยนหน้าด้วย `#hash`) |
| `js/app.js` | หน้าจอทั้งหมด: หน้าแรก, เลือกแนว, ปลายทางที่อาจได้, จ่ายเงิน, เปิดกล่อง, ทริป, ที่พักพาร์ตเนอร์, ของขวัญองค์กร |
| `js/itinerary.js` | สุ่มสถานที่ในแต่ละช่วง คำนวณเวลา พระอาทิตย์ขึ้น-ตก และการเดินทางแต่ละช่วง |
| `js/tripmap.js`, `js/traveler3d.js` | แผนที่เอียง (MapLibre) และตัวละคร low-poly (three.js) |
| `js/promptpay.js` | สร้าง QR พร้อมเพย์ตามมาตรฐาน EMVCo |
| `js/config.js` | ราคา, เลขพร้อมเพย์, หมวด, วิธีเดินทาง |
| `data/destinations.json` | ข้อมูลที่สร้างจาก `tools/` |
| `tools/fetch_pois.py` | ดึงร้าน ที่พัก และที่เที่ยวจริงจาก OpenStreetMap (Overpass) |
| `tools/build_data.py` | จัดสถานที่เข้าช่วงต่าง ๆ แล้วคำนวณเส้นทางเดิน/ขับจริงด้วย OSRM |
| `docs/checklist.csv` | รายชื่อสถานที่ทั้งหมด ไว้ให้ทีมเช็กใน Google Maps |
| `docs/TEAM_KIT.md` | สคริปต์โทรหาโรงแรม, ข้อความโพสต์, บทคลิป, คำตอบสำหรับกรรมการ |

## รันในเครื่อง

```bash
python -m http.server 5173 --directory .
```

แล้วเปิด http://localhost:5173

## อัปเดตข้อมูล

```bash
python -I tools/fetch_pois.py
python -I tools/build_data.py
```

## เตรียมไฟล์อัปโหลด

```bash
python -I tools/package.py
```

ได้โฟลเดอร์ `dist/` ไว้อัปโหลดขึ้น Netlify, GitHub Pages หรือ Cloudflare Pages

## แหล่งข้อมูลและสิทธิ์การใช้งาน

- สถานที่: © ผู้ร่วมพัฒนา OpenStreetMap (ODbL)
- แผนที่: OpenFreeMap / OpenMapTiles
- เส้นทาง: OSRM ผ่าน routing.openstreetmap.de
- ราคาห้อง "ปกติ" และ "ราคาลับ" เป็นตัวเลขสมมติ ยังไม่ได้มาจากโรงแรมจริง

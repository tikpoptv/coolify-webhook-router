# Coolify Webhook Router

Coolify ส่ง webhook ได้แค่ URL เดียวต่อ team — service นี้รับ webhook นั้นแล้วแยกส่งไปยัง Discord / Slack / Telegram / webhook อื่น ตามโปรเจค, environment และ event โดยตั้งค่าทั้งหมดผ่านหน้าเว็บ ไม่ต้อง redeploy

```
Coolify ──POST──▶ /hook/<token> ──▶ หาโปรเจค ──▶ เทียบกฎ ──▶ #shop-prod / #blog / #infra
```

## Deploy บน Coolify

1. push repo นี้ขึ้น Git แล้วสร้าง Application ใน Coolify (Build pack: **Dockerfile**), port `8080`
2. **Persistent storage:** mount volume ไปที่ `/data` (เก็บค่าตั้งและประวัติใน SQLite)
3. **Environment variables:**

   | ตัวแปร | จำเป็น | ความหมาย |
   |---|---|---|
   | `ADMIN_PASSWORD` | ✔ | รหัสผ่านเข้าหน้า UI (user: `admin`, เปลี่ยนได้ด้วย `ADMIN_USER`) — เปลี่ยนรหัสแล้วทุก session จะหลุด |
   | `HOOK_TOKEN` | | token ใน URL ของ webhook — ไม่ใส่ก็ได้ ระบบจะสุ่มให้และแสดงในหน้า UI |
   | `COOLIFY_URL`, `COOLIFY_API_TOKEN` | | ค่าเริ่มต้นของการเชื่อม Coolify API (ตั้งในหน้า UI แทนได้) |

4. ผูกโดเมน (เช่น `hooks.example.com`) แล้วเปิดหน้าเว็บและเข้าสู่ระบบ
5. ทำตามหน้า **ภาพรวม**: คัดลอก webhook URL ไปใส่ใน Coolify → Notifications → Webhook, เลือก event ทั้งหมด, กด Enable

> Coolify ปฏิเสธ URL ที่เป็น IP ภายใน/localhost — ใช้โดเมนสาธารณะของ router หรือเพิ่มใน Settings → Advanced → Allowed internal targets

## การใช้งาน

- **ปลายทาง** — เพิ่ม Discord / Slack / Telegram / webhook แล้วกด "ส่งทดสอบ"
- **กฎ** — เลือกโปรเจค / environment / event (ใช้ `*` ได้ เช่น `backup_*`) / เฉพาะล้มเหลว → ปลายทาง มีผลทันที; event ที่ตรงหลายกฎจะส่งไปทุกปลายทางที่ตรง
- **ช่องสำรอง** — event ที่ไม่ตรงกฎไหนเลย (เช่น server ล่ม, ข้อความทดสอบ) ไปที่นี่
- **ประวัติ** — ดู 200 event ล่าสุด ส่งไปไหน สำเร็จไหม พร้อม payload
- **ทดลอง** — วาง payload ดูว่าจะไปที่ไหน ก่อนใช้จริง

## การหาโปรเจคของ event

| Event | หาโปรเจคจาก |
|---|---|
| `deployment_*`, `status_changed`, `restart_limit_reached` | field `project` / `environment` ใน payload |
| `backup_*`, `task_*`, `image_*` | uuid → Coolify API (ต้องตั้ง API token สิทธิ์ read) |
| `server_*`, `docker_cleanup_*`, `container_restarted`, `api_token_failing`, `test` | ไม่ผูกโปรเจค → ใช้กฎตาม event หรือช่องสำรอง |

ข้อมูลจาก Coolify API เก็บแคช 5 นาที และโหลดใหม่ทันทีเมื่อเจอ uuid ใหม่ (ไม่เกินทุก 30 วินาที)

## ความปลอดภัย

- **หน้า UI:** login ด้วย session cookie (HttpOnly, SameSite=Strict, Secure เมื่อเป็น HTTPS) อายุ 7 วัน ใส่รหัสผิด 5 ครั้งจาก IP เดียวกันจะล็อก 5 นาที
- **Webhook:** Coolify ไม่เซ็นชื่อ request จึงใช้ token สุ่มใน URL แทน — token ผิดจะได้ 404

## พัฒนา

Backend เป็น Go, หน้าเว็บเป็น React + [Ant Design](https://ant.design) (โฟลเดอร์ `web/`) ซึ่ง build แล้วฝังเข้าไบนารีด้วย `go:embed`

```sh
# รันแบบเดียวกับ production
cd web && npm install && npm run build && cd ..
ADMIN_PASSWORD=dev LISTEN_ADDR=:8787 go run .     # http://localhost:8787

# แก้หน้าเว็บแบบ hot reload (เปิด Go server ด้านบนค้างไว้)
cd web && npm run dev                              # http://localhost:5173

go test ./...
```

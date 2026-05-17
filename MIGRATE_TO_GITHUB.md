# Migrate Stock Dashboard to GitHub

คู่มือ migrate โปรเจกต์ `stock-dashboard-app` ขึ้น GitHub แบบครบขั้นตอน

---

## 1. เตรียมก่อน push

### 1.1 ตรวจสอบความลับ (ห้าม commit เด็ดขาด)
- `ANTHROPIC_API_KEY`
- `FMP_API_KEY`
- ไฟล์ `.env`, `.env.local`, `.dev.vars`
- token / credentials ใด ๆ

> ✅ Worker secrets ตั้งผ่าน `wrangler secret put` อยู่บน Cloudflare แล้ว ไม่อยู่ในโค้ด — ปลอดภัย

### 1.2 สร้าง `.gitignore`
สร้างไฟล์ `.gitignore` ที่ root ของโปรเจกต์:

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Build output
dist/
build/
.wrangler/
.vite/

# Environment / secrets
.env
.env.local
.env.*.local
.dev.vars
*.pem

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Editor / OS
.DS_Store
.idea/
.vscode/
*.swp
*.swo
Thumbs.db

# Playwright / test artifacts
.playwright-mcp/
playwright-report/
test-results/

# Backup / old files
*-old.js
*-old*.jsx
*-old*.js
worker-index.js
{src,worker}/
```

### 1.3 ลบไฟล์ backup ที่ไม่ต้องการ (ทางเลือก)
ไฟล์เก่าที่อาจไม่ต้องการ push:
- `src/App-9.jsx`, `src/App-lod2.jsx`, `src/App-old.jsx`, `src/App-old7.jsx`
- `src/Dashboard-old.jsx`
- `worker/index-old*.js`, `worker/worker-index.js`
- `pokproject-router/index-old.js`
- โฟลเดอร์ประหลาด `{src,worker}/`

```bash
# ลบไฟล์ backup (ถ้าต้องการ)
rm src/App-9.jsx src/App-lod2.jsx src/App-old.jsx src/App-old7.jsx
rm src/Dashboard-old.jsx
rm worker/index-old*.js worker/worker-index.js
rm pokproject-router/index-old.js
rm -rf "{src,worker}"
```

---

## 2. สร้าง Repo บน GitHub

### ทางเลือก A: ผ่าน GitHub Web
1. ไป https://github.com/new
2. ตั้งชื่อ: `stock-dashboard-app`
3. เลือก **Private** หรือ **Public**
4. **ห้าม** ติ๊ก "Add a README" / "Add .gitignore" (เพราะ project มีอยู่แล้ว)
5. กด **Create repository**

### ทางเลือก B: ผ่าน GitHub CLI
```bash
# ติดตั้ง gh (ครั้งแรก)
brew install gh
gh auth login

# สร้าง repo
gh repo create stock-dashboard-app --private --source=. --remote=origin
```

---

## 3. Init Git + Push ครั้งแรก

```bash
cd /Users/pok/Desktop/Claud/stock-dashboard-app

# init repo
git init
git branch -M main

# stage + commit
git add .
git status   # ตรวจอีกครั้งว่าไม่มี .env / secrets หลุด
git commit -m "Initial commit: stock dashboard app"

# เชื่อม remote (แทน USERNAME ด้วยชื่อ GitHub ของคุณ)
git remote add origin https://github.com/USERNAME/stock-dashboard-app.git

# push
git push -u origin main
```

---

## 4. ตรวจสอบหลัง push

- [ ] เปิด repo บน GitHub ดูว่าไฟล์ครบ
- [ ] ตรวจว่า `.env`, `.dev.vars`, `node_modules/`, `dist/` ไม่ถูก push
- [ ] อ่าน `README.md` บนหน้า repo
- [ ] ถ้า public — ลอง search หา `ANTHROPIC_API_KEY` / `sk-` ใน repo ให้แน่ใจว่าไม่มี key หลุด

---

## 5. (Optional) เชื่อม Cloudflare Pages กับ GitHub

หลัง push สำเร็จ สามารถตั้ง auto-deploy ได้:

1. Cloudflare Dashboard → **Pages** → **Create a project** → **Connect to Git**
2. เลือก repo `stock-dashboard-app`
3. ตั้งค่า build:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
   - **Root directory**: `/`
4. Environment variables:
   - `VITE_API_URL` = `https://stock-dashboard-api.YOUR_SUBDOMAIN.workers.dev`
5. **Save and Deploy**

ตั้งแต่นี้ทุกครั้งที่ `git push` → Cloudflare Pages จะ build + deploy อัตโนมัติ

---

## 6. ถ้าเผลอ commit secret หลุดไป

```bash
# 1. revoke key นั้นทันทีบน console.anthropic.com / financialmodelingprep.com
# 2. ลบประวัติ
git rm --cached .env
git commit -m "Remove leaked secret"

# 3. ถ้า push แล้ว — ต้อง rewrite history
brew install git-filter-repo
git filter-repo --path .env --invert-paths
git push --force origin main
```

---

## 7. Workflow ใช้งานหลังจากนี้

```bash
# แก้โค้ด → commit → push
git add .
git commit -m "feat: ..."
git push

# pull งานล่าสุด
git pull
```

---

## คำสั่งสรุป (Quick Start)

```bash
cd /Users/pok/Desktop/Claud/stock-dashboard-app
# สร้าง .gitignore ตามตัวอย่างข้างบนก่อน
git init
git branch -M main
git add .
git commit -m "Initial commit"
gh repo create stock-dashboard-app --private --source=. --remote=origin --push
```

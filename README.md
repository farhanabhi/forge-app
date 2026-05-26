# FORGE PWA — Installation Guide
**Version 3.0 | Dark Premium Gym & Nutrition Tracker**

---

## What's Inside

```
FORGE_PWA/
├── index.html          ← Main app (open this)
├── styles.css          ← All styles
├── app.js              ← Full app logic
├── db.js               ← IndexedDB storage layer
├── foods.js            ← 600+ food database
├── manifest.json       ← PWA manifest
├── service-worker.js   ← Offline support
├── icons/              ← App icons (all sizes)
│   ├── icon-72.png
│   ├── icon-192.png
│   └── ... (8 sizes)
└── README.md           ← This file
```

---

## METHOD 1 — Install on Your Phone (FREE, No Server Needed)

### Step 1 — Transfer Files to Phone

**Option A: Google Drive (Easiest)**
1. Upload the entire `FORGE_PWA` folder to Google Drive
2. On your phone, open Google Drive → find `FORGE_PWA` folder
3. Download the folder (or share as a link)

**Option B: USB Cable**
1. Connect phone to PC via USB
2. Enable "File Transfer" mode on phone
3. Copy the `FORGE_PWA` folder to phone storage (e.g. `Downloads/FORGE_PWA`)

**Option C: WhatsApp / Telegram to yourself**
- Send `index.html` to yourself, but note: this method won't load CSS/JS from other files.
- Use Google Drive or USB instead for full functionality.

---

### Step 2 — Open in Chrome (Android)

1. Open **Files** app on your phone
2. Navigate to where you saved `FORGE_PWA`
3. Tap `index.html`
4. Choose **"Open with Chrome"**
5. App loads fully — all features work offline!

---

### Step 3 — Add to Home Screen (Install as App)

**On Android (Chrome):**
1. Open `index.html` in Chrome
2. Tap the **3-dot menu** (⋮) at top right
3. Tap **"Add to Home screen"**
4. Tap **"Add"** on the prompt
5. FORGE icon appears on your home screen! 🎉

**Or use the Install button** that appears inside the app (bottom right, lime green button).

**On iPhone (Safari):**
1. Open `index.html` in **Safari** (must be Safari for iOS PWA)
2. Tap the **Share button** (box with arrow) at bottom
3. Scroll down → tap **"Add to Home Screen"**
4. Tap **"Add"** — done!

---

## METHOD 2 — Host Online (Access from Anywhere)

### GitHub Pages (100% Free)

1. Create a free account at [github.com](https://github.com)
2. Create a new repository (e.g. `forge-app`) — set to **Public**
3. Upload all files from `FORGE_PWA/` to the repo root
4. Go to **Settings → Pages → Source → main branch → / (root)**
5. Your app is live at: `https://yourusername.github.io/forge-app`
6. Open this URL in Chrome on your phone → Add to Home Screen

### Netlify (Easiest drag-and-drop)

1. Go to [netlify.com](https://netlify.com) — sign up free
2. Drag and drop the entire `FORGE_PWA` folder onto the Netlify dashboard
3. Netlify gives you a URL like `https://random-name.netlify.app`
4. Open in Chrome on phone → Add to Home Screen

### Vercel

1. Go to [vercel.com](https://vercel.com) — sign up free
2. Install Vercel CLI: `npm i -g vercel`
3. In the `FORGE_PWA` folder: `vercel --prod`
4. Get your URL and install on phone

---

## Features Guide

### TODAY Tab
- Shows your current plan day with all exercises
- Tap exercise circle to mark done
- **Skip** individual exercises
- **Log Weight** button for weighted exercises → saved as PR
- **⏱ Rest** button starts a countdown rest timer
- **Complete Day / Skip Day** buttons
- Live workout timer at top
- Quick calorie + body weight summary

### PLANS Tab
- **Create New Plan** → choose 7/14/21/28 days
- Set goal: Strength, Hypertrophy, Fat Loss, Athletic
- For each day: set name, toggle Workout/Rest
- Tap 💪 icon to open **Exercise Builder** for that day
- Add unlimited exercises with sets, reps, target weight, rest time
- Duplicate or delete exercises
- **Set as Active** to switch plans
- Duplicate or delete plans

### NUTRITION Tab
- Navigate days with ← → arrows
- 6 meal slots: Breakfast, Lunch, Dinner, Snacks, Pre/Post Workout
- **600+ food database** — search by name
- Filter by category: Indian, Protein, Fast Food, Supplements, etc.
- Select food → enter quantity in grams/ml/pieces → Add
- Manual entry for any food not in the database
- Save custom foods for reuse
- Recent foods for quick re-adding
- Live macro bars (Protein, Carbs, Fat)
- Set daily calorie + macro goals

### PROGRESS Tab
- **Workout**: 13-week consistency heatmap + weekly completion chart
- **Body Wt**: Weight trend chart + full log list
- **Nutrition**: Daily calories + protein charts (1mo/3mo/6mo/1yr)
- **Lifts**: Per-exercise PR progression chart
- Range filter: 1 Month / 3 Months / 6 Months / 1 Year

### CUSTOM Tab
- Add custom foods with full macro info
- Saved foods appear in the food picker search

---

## Data Storage

- All data stored **on your device** using IndexedDB (falls back to localStorage)
- **No internet required** after first load (service worker caches everything)
- No account, no cloud, no subscription — 100% private
- Data persists permanently until you clear browser data

---

## Troubleshooting

**App not loading?**
- Make sure all files are in the same folder
- Open `index.html` specifically in Chrome (not a file manager preview)

**Fonts not showing?**
- Need internet on first load to download fonts
- After that, works offline

**"Add to Home Screen" not showing?**
- Must use Chrome on Android or Safari on iPhone
- Samsung Internet browser also supports it

**Data lost after clearing browser?**
- Data lives in your browser's IndexedDB
- To backup: the app uses IndexedDB — you can export data in a future update
- Don't clear Chrome's site data for the FORGE page

---

## Tech Stack
- Pure HTML + CSS + JavaScript (no frameworks)
- IndexedDB for storage
- Chart.js for charts
- Tabler Icons
- Service Worker for offline PWA
- Web App Manifest for installation

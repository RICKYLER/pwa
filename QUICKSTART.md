# Quick Start Guide — MSWDO Census PWA

You should be up and running in under a minute. Here's everything you need.

---

## Start the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. That's it.

The first time you log in, the app automatically seeds itself with sample data — two households, seven residents with varied ages, and pre-calculated vulnerability stats — so you don't have to set anything up manually before you can explore.

---

## Default Admin Account

Use the main admin account below to sign in.

| Role | Email | Password | What They Can Do |
|------|-------|----------|------------------|
| **Admin** | MSWDOOO2017@gmail.com | mswdoooadmin123 | Everything — user management and full system access |

---

## Quick 5-Minute Demo Flow

### Step 1 — See Automatic Age Categorization in Action

This is the heart of the app. Go to **Dashboard → Add Household**, and create a test family. Then add a member with this birthdate: `2015-11-10`.

Don't select any age category or vulnerability flag. Just save.

You'll see a **"Child"** badge appear automatically. The system computed the age from the birthdate and tagged the resident without you doing a thing. That's the innovation.

### Step 2 — Check the Vulnerability Dashboard

Click **"Vulnerability Dashboard"** in the left menu. Your new resident is already counted. Filter by "Children (0–17)" and they appear instantly.

### Step 3 — Generate an Official Report

Go to **Reports → Monthly Summary**. The updated counts are there. Hit **Print** for a PDF-ready layout.

### Step 4 — Create a Relief Distribution Event

Go to **Relief Distribution → New Event**. Create a "Child Aid" event, set the type to **"Child Support"**, and save.

Without you selecting a single beneficiary manually, the system already has your child listed as eligible.

---

## Key Files (If You Want to Dig Deeper)

### The Innovation Engine
```
/lib/db/vulnerability.ts
  ├── calculateAge()             ← Computes age from birthdate
  ├── getAgeCategory()           ← Returns "child", "adult", or "senior"
  └── calculateVulnerabilityFlags() ← Builds the full vulnerability profile
```

### Database Layer
```
/lib/db/indexeddb.ts    ← IndexedDB initialization
/lib/db/schema.ts       ← TypeScript type definitions
/lib/db/households.ts   ← Household CRUD operations
/lib/db/residents.ts    ← Resident CRUD operations
/lib/db/distribution.ts ← Relief event operations
/lib/db/queries.ts      ← Complex queries used in reports
```

### Pages
```
/app/households/new     ← Add a new household
/app/vulnerability      ← Vulnerability dashboard with filters
/app/reports            ← Report menu
/app/distribution       ← Relief distribution events
```

---

## Test Scenarios

### ✅ Auto-Age Calculation
1. Add a resident born in 2015
2. System shows their current age
3. System auto-tags them as "Child"
4. No dropdown. No manual selection. It just works.

### ✅ Vulnerability Filtering
1. Open the Vulnerability Dashboard
2. Filter by "Seniors (60+)"
3. The pre-seeded senior (born 1950) appears
4. Counts are accurate and live

### ✅ Auto-Beneficiary Selection
1. Create a distribution event
2. Set type to "Senior Relief"
3. All seniors in the system are automatically listed as eligible
4. No clicking through a list to select them one by one

### ✅ Report Generation
1. Add a new household with members
2. Go to Reports → Monthly Summary
3. Updated counts appear immediately
4. Click Print — you get a clean, formatted PDF preview

### ✅ Duplicate Prevention
1. Create a distribution event
2. Record a distribution for a beneficiary
3. Try to record another distribution for the same person in the same event
4. The system blocks it with a clear error message

---

## Troubleshooting

**"Database not initialized" error**
Just refresh the page. The database initializes on your first login and seeds itself automatically.

**"No households found"**
This usually means the seed data hasn't loaded yet. Try logging out and logging back in.

**"Can't access certain pages"**
Check your current role. Some pages are restricted. Log in as Admin for full access.

**App feels slow with a lot of data**
IndexedDB handles around 1,000 records comfortably. If you're building for production scale, check `ARCHITECTURE.md` for Supabase integration details.

---

## Development Commands

```bash
npm run dev       # Start the dev server
npm run build     # Build the production bundle
npm run start     # Serve the production build
npm run lint      # Run ESLint checks
```

To inspect the database directly:
```
Open DevTools → Application tab → IndexedDB → mswdo_census
```

---

## Installing as a Mobile App

**On iOS (Safari)**
1. Open the app in Safari on your iPhone
2. Tap the Share button → "Add to Home Screen"
3. The app installs and behaves like a native app

**On Android (Chrome)**
1. Open the app in Chrome on your Android device
2. Tap the three-dot menu → "Install app"
3. Done — works standalone without a browser bar

---

## The Key Things to Show in a Demo

If you have 10 minutes for a defense or presentation, this is the suggested order:

1. **Login (30s)** — Show different roles have different views
2. **Add Household + Members (2m)** — THE MAIN MOMENT. No age dropdowns. No category selection.
3. **Vulnerability Dashboard (1m)** — Filter, see live counts
4. **Generate Report (1m)** — Print-ready monthly summary
5. **Relief Distribution (2m)** — Auto-beneficiaries, duplicate prevention
6. **Offline Mode (optional, 1–2m)** — DevTools → Network → Offline. Data still works.

**Total: ~8–12 minutes**

---

## Common Questions

**Is my data saved if I refresh?**
Yes. Everything is stored in IndexedDB, which persists across page reloads and even browser restarts.

**Can I use this offline?**
Yes. All data is stored locally. You can view, add, and edit while offline. Syncing to a cloud backend will be possible once Supabase is connected (the groundwork is already there).

**Can I export data?**
Reports can be printed or saved as PDFs. CSV export is ready to wire up in the reports section.

**Why is there already sample data?**
So you don't have to manually create households before you can demo the features. The seed data is automatically loaded on first login.

**What happens if I "delete" something?**
Records are soft-deleted — they're marked as "moved_out" or "deceased" and hidden from main views, but they're preserved in the database for audit purposes.

---

Good luck with your defense! 🎓

The system is ready. Just run `npm run dev` and start exploring.

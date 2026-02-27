# MSWDO Census PWA - Quick Start Guide

## 🚀 Get Started in 60 Seconds

### 1. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Login with Demo Account
**Email**: `encoder@barangay.local`  
**Password**: `encoder123`

(or try any of the 4 demo roles below)

### 3. Explore Dashboard
Dashboard loads immediately with pre-seeded data:
- 2 households
- 7 residents (varied ages)
- Auto-calculated statistics

---

## 🔐 Demo User Accounts

| Role | Email | Password | Access |
|------|-------|----------|--------|
| **Admin** | admin@mswdo.local | admin123 | Full system access, user management |
| **Encoder** | encoder@barangay.local | encoder123 | Add households, manage residents ← **Best for demo** |
| **Health Worker** | health@barangay.local | health123 | Update health flags (pregnant, PWD) |
| **Responder** | responder@drrmo.local | responder123 | View vulnerable residents, incidents |

---

## 🎯 Quick Demo Flow (5-10 minutes)

### Step 1: See Automatic Age Categorization
```
Login → Dashboard → "Add Household" 
  ├─ Name: "Test Family"
  ├─ Address: "456 Oak Avenue"
  ├─ Purok: "Purok 2"
  └─ Save

Click "Add Member":
  ├─ Name: "Test Child"
  ├─ Birthdate: 2015-11-10 (10 years old) ← ENTER DATE
  └─ Save
  
💡 Notice: System automatically shows "Child" badge
   (No dropdown selection needed!)
```

### Step 2: View Vulnerability Dashboard
```
Click: "Vulnerability Dashboard" (left menu)
  └─ See: New child automatically counted
  └─ Filter: "Children (0-17)" → Shows new resident
  └─ See: Auto-calculated statistics
```

### Step 3: Generate Official Report
```
Click: "Reports" → "Monthly Summary"
  └─ Shows: Updated population counts
  └─ Shows: Age distribution breakdown
  └─ Print: Click "Print" button
```

### Step 4: Create Relief Distribution
```
Click: "Relief Distribution" → "New Event"
  ├─ Event Name: "Child Aid"
  ├─ Type: "Child Support" ← SELECT THIS
  ├─ Location: "Community Center"
  └─ Save
  
Result: System shows all children as automatic beneficiaries!
```

---

## 📁 Key Files to Explore

### Understanding the Innovation
```
/lib/db/vulnerability.ts
  ├─ calculateAge() - Computes age from birthdate
  ├─ getAgeCategory() - Returns child/adult/senior
  └─ calculateVulnerabilityFlags() - Auto-tags residents
```

### Database Layer
```
/lib/db/indexeddb.ts - IndexedDB initialization
/lib/db/schema.ts - TypeScript type definitions
/lib/db/households.ts - Household CRUD
/lib/db/residents.ts - Resident CRUD
/lib/db/distribution.ts - Relief event operations
```

### Pages to Visit
```
/app/households/new - Add household form
/app/vulnerability - View vulnerable residents
/app/reports - Generate official reports
/app/distribution - Relief distribution events
```

---

## 🧪 Test Scenarios

### Test 1: Auto-Age Calculation
1. Add resident born in 2015
2. System shows age as ~11 years
3. System auto-tags as "Child"
4. ✅ No manual category selection required

### Test 2: Vulnerability Filtering
1. Go to Vulnerability Dashboard
2. Filter by "Seniors (60+)"
3. Pre-seeded senior (born 1950) appears
4. ✅ Filter works, counts accurate

### Test 3: Auto-Beneficiary Selection
1. Create distribution event
2. Type: "Senior Relief"
3. System auto-selects all seniors
4. ✅ No manual selection needed

### Test 4: Report Generation
1. Add/edit a household
2. Go to Reports → Monthly Summary
3. Updated population counts shown
4. ✅ Click "Print" → PDF preview works

### Test 5: Duplicate Prevention
1. Create distribution event
2. Select a beneficiary
3. Try to select same beneficiary again
4. ✅ System prevents duplicate

---

## 🔍 Troubleshooting

### "Database not initialized" error
```
→ Refresh page
→ First login triggers auto-initialization
→ Seed data loads automatically
```

### "No households found"
```
→ You're logged in but no data yet
→ Click "Add Household" to create first one
→ OR: Seed data may not have loaded
→ Solution: Logout → Login again
```

### "Can't access some pages"
```
→ Your role might not have permission
→ Try logging in as Admin (admin@mswdo.local)
→ Or check /lib/auth.ts for permission matrix
```

### Performance slow with large dataset
```
→ IndexedDB handles ~1000 records fine
→ For production: Use Supabase backend
→ See ARCHITECTURE.md for scaling info
```

---

## 💻 Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run linting
npm run lint

# View database (in browser DevTools)
F12 → Application → IndexedDB → mswdo_census
```

---

## 📱 Testing on Mobile

### iOS
1. Open in Safari on iPhone
2. Tap Share → Add to Home Screen
3. Works as native app

### Android
1. Open in Chrome on Android
2. Menu → Install app
3. Works as native app

---

## 🎓 Learning Path

### For Understanding the Innovation
1. Read: `/lib/db/vulnerability.ts` - See age calculation
2. Read: `/lib/db/residents.ts` - See how flags are created
3. Try: Add resident with birthdate → See auto-tags appear

### For Understanding Architecture
1. Read: `ARCHITECTURE.md` - System design overview
2. Read: `DEMO_FLOW.md` - Detailed demo walkthrough
3. Explore: `/lib/db/` folder - All CRUD operations

### For Understanding Features
1. Read: `FEATURES.md` - Complete feature checklist
2. Read: `README.md` - Project overview
3. Explore: `/app/` folder - All pages and routes

---

## 🎬 Demo Highlights to Show

✨ **The Main Innovation**
```
Birthdate: 1964-02-28 (Born)
Today: 2026-02-28 (Age 62)
Result: AUTOMATICALLY tagged as "Senior" 🎉

No manual age dropdown!
No manual category selection!
100% automatic!
```

📊 **Real-Time Dashboard**
```
Add household → Dashboard updates instantly
Add resident → Vulnerability count increases
Change status → Report statistics change
All automatic, no manual refresh!
```

🎁 **Auto-Beneficiary Selection**
```
Create "Senior Relief" event
System: "Found 3 eligible seniors"
All seniors automatically selected
No manual clicking through lists!
```

---

## ❓ FAQ

**Q: Is my data saved?**
A: Yes, all data persists in IndexedDB (offline storage). Data survives page refresh and browser restart.

**Q: How does offline work?**
A: All data is stored locally in IndexedDB. When offline, you can still view and add data. Sync happens automatically when online (future feature with Supabase).

**Q: Can I export data?**
A: Yes, reports can be printed or exported. Full CSV export ready in Phase 2.

**Q: Why is there demo data?**
A: Pre-seeded households and residents let you test immediately without manual data entry. Perfect for capstone demo!

**Q: What happens if I delete something?**
A: Deletions are "soft deletes" - records marked as "moved_out" or "deceased" rather than permanently removed. This preserves audit trail.

**Q: Can I use this in production?**
A: Yes! Phase 1 is production-ready. For scaling, connect Supabase backend (ready in ARCHITECTURE.md).

---

## 📞 Need Help?

### Check These Files First
- `README.md` - Overview
- `ARCHITECTURE.md` - Technical details
- `DEMO_FLOW.md` - Detailed demo walkthrough
- `FEATURES.md` - What's implemented

### Check the Code
- `/lib/db/` - Database operations
- `/lib/auth.ts` - Authentication logic
- `/app/` - All pages

### Common Issues
- "Authentication failed" → Check localStorage is enabled
- "No data showing" → Page might still loading, wait 2s
- "Button not working" → Check your role permissions

---

## 🎯 What to Demonstrate

**For a 10-minute defense demo, show:**

1. ✅ Login (30s) - Show role-based access
2. ✅ Add Household (1m) - Create a test family
3. ✅ Add Members with Auto-Categorization (2m) - THE STAR
   - Add child (auto-tagged "Child")
   - Add senior (auto-tagged "Senior")
4. ✅ Dashboard Updates (1m) - See real-time statistics
5. ✅ Vulnerability Dashboard (1m) - Filter and view
6. ✅ Generate Report (1m) - Show official output
7. ✅ Relief Distribution (1m) - Show auto-beneficiaries
8. ✅ Optional: Offline mode (1m) - DevTools offline

**Total: 10-12 minutes**

---

## 🚀 Ready to Go!

Your MSWDO Census PWA is ready to demonstrate!

```
npm run dev
# Open http://localhost:3000
# Login with encoder@barangay.local / encoder123
# Follow the demo flow above
# Show the innovation: Automatic age-based categorization
```

Good luck with your capstone defense! 🎓

---

**Happy Demoing!** 🎉

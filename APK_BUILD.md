# Build an Android App (APK) from the PWA

> **Why this exists.** The PWA can only be *installed* through the browser, which is
> manual on iPhones and confusing for some staff. By wrapping the PWA as a native
> **Android app (APK)**, users install it like any normal app — one tap, no manual
> steps, auto-updates from the web.

The app URL this config points at is **`https://pwa-vq8b.vercel.app`** (see
`.env.production`). The APK is a **thin shell** that loads the live web app — you do
**not** need to rebuild it every time you change the code. Only rebuild when you change
the app name, icon, or start URL.

---

## Option 1 — Easiest: PWA Builder website (no coding, no Android Studio)

1. Go to **https://www.pwabuilder.com**
2. Enter your app URL: `https://pwa-vq8b.vercel.app` → click **Start**
3. On the **Package** step, choose **Android**
4. Click **Package for store**, wait for it to build, then download the **APK** file
   (or the AAB if you plan to publish to Google Play)
5. Send that APK file to staff — they just open it and tap **Install**

> PWA Builder uses your `/manifest.json` and `/icon-512.png` automatically, so no
> extra setup is needed on your side.

---

## Option 2 — Bubblewrap CLI (more control)

### Prerequisites

| Tool | Why | Install |
|------|-----|---------|
| Node.js 18+ | Run Bubblewrap | Already installed for this project |
| Java JDK 11+ | Build the Android app | https://adoptium.net (Temurin 17 LTS) |
| Android SDK | Compile the APK | Android Studio → SDK Manager → *Android SDK Platform 34* + *Build Tools* |

### Steps

```bash
# 1. Install Bubblewrap (once)
npm install -g @bubblewrap/cli

# 2. Generate the Android project from your web manifest
#    (answers are filled in below — the config file at ./twa-manifest.json has them all)
npm run apk:init
#    If that command complains about the config file, use the web manifest URL instead
#    and type the values from the table below:
#    bubblewrap init --manifest https://pwa-vq8b.vercel.app/manifest.json

# 3. Build the signed APK
npm run apk:build
```

The signed APK will be at:
```
android/app-release-signed.apk
```

### Use these values when `apk:init` asks you

| Prompt | Value |
|--------|-------|
| Application ID | `ph.gov.mabini.mswdo` |
| App name | `E-Mabini MSWDO` |
| Launcher name (short name under the icon) | `E-Mabini` |
| App version | `1.0.0` |
| Version code | `1` |

> All of these are already pre-filled in [`twa-manifest.json`](./twa-manifest.json) if
> your Bubblewrap version accepts a local config file (`bubblewrap init --manifest twa-manifest.json`).

---

## ⚠️ Important notes (read before distributing)

1. **Back up your signing keystore.**
   The first build creates a key at `android/android.keystore` (or as configured).
   **Keep it safe.** Any future update to the APK must be signed with the *same* key or
   Android will refuse to install over the old version.

2. **The app auto-updates.** Because the APK is just a shell, every time you deploy new
   code to Vercel, users get the new version automatically the next time they open the
   app. No need to send them a new APK for normal code changes.

3. **HTTPS is required** — the web app must be served over `https://`. Vercel already
   does this. `http://localhost` also works for testing.

4. **iPhone users still use the manual method.** iOS does not allow installing an APK.
   For iPhones, keep the in-app guide (Share → Add to Home Screen).

5. **Changing your domain?** If you ever move the app to a custom domain, update
   `host`, `fullScopeUrl`, `webManifestUrl`, and `iconUrl` in `twa-manifest.json`, then
   rebuild the APK (and keep the same signing key).

6. **Distribution ideas**
   - Upload the APK somewhere shareable and put the link in `NEXT_PUBLIC_APK_URL`
     (see `.env.production`). When that variable is set, Android users get an
     **instant download**: pressing the main **"Download App"** button saves the
     `.apk` file straight to the phone (no browser install prompt, no manual steps),
     and the install dialog also shows an **"Android App (APK)"** card. They tap the
     downloaded file to install it like any normal app.
   - Publish to **Google Play Console** (needs a developer account, ~$25 one-time) using
     the AAB bundle instead of the APK.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Java not found` | Install a JDK (Temurin 17) and set `JAVA_HOME` |
| `Android SDK not found` | Open Android Studio → SDK Manager → install Platform 34 + Build Tools, and set `ANDROID_HOME` |
| `bubblewrap: command not found` | Reinstall: `npm install -g @bubblewrap/cli` |
| APK won't install on a phone | Allow "Install from unknown sources" on the phone (Settings → Security) |

# J&J Sports Wear — Integrated Workspace Hub

A complete static project built from your **actual original files** for Studio Manager and Press Manager. The full existing systems were **kept** and separated into CSS/JS/HTML; both are now accessible after the sign-in Hub.

## Files

| File | Purpose |
|---|---|
| `index.html`, `style.css`, `script.js` | Login and Workspace Hub |
| `studio.html`, `studio.css`, `studio.js` | Complete Studio Manager |
| `press.html`, `press.css`, `press.js` | Complete Press Manager |
| `theme-init.js` | Original shared theme preferences |
| `auth.js`, `app-gate.js`, `workspace-access.css` | Access checking, Hub/Logout menu |
| `supabase-config.js`, `cloud-index.js`, `cloud-sync.js` | Optional Supabase Auth and data bridge |
| `supabase-setup.sql` | Database tables, access rules and revision-safe RPC |

## Quick start: LOCAL DEMO ONLY

1. Extract ZIP to a folder, keeping all files together.
2. Use a localhost web server to view the folder, e.g. with Python: `python -m http.server 8000` (run in this folder).
3. Open `http://localhost:8000`. (You may be able to open HTML directly in some browsers, but localhost is more reliable for cryptography.)
4. Create your Owner account. Sign in. Open **Studio Manager** or **Press Manager**; now both original systems really open.
5. Owner can make local Staff and Admin accounts. Staff can open Press Manager only *through the demo UI*.

**Local mode is a demonstration, not secure authentication.** It is possible to bypass browser-only role checks. Do **not** deploy the unconfigured version publicly for real employee/customer/financial data.

## Supabase cloud mode (recommended before publishing for real use)

1. Create a Supabase project.
2. Run `supabase-setup.sql` under **Supabase → SQL Editor**.
3. Under **Authentication → Users**, create the first user with a confirmed email and strong password. Do not enable untrusted public signup.
4. In SQL Editor, use the commented example at the end of the SQL file to create a `public.user_profiles` row for that user with role `owner`. Repeat for other accounts with role `admin` or `staff`.
5. Open `supabase-config.js`. Replace `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE` and `PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE` with **Project URL** and **publishable key** from Supabase Project Settings / Connect. A legacy `anon` key is also accepted by this integration.
6. Upload all files to your GitHub repository, keeping `index.html` in its root. Enable **Settings → Pages → Deploy from a branch → main → /(root)**.
7. In Supabase, configure **Authentication → URL Configuration** with the GitHub Pages site URL (useful for future password reset / email confirmation flows).
8. Sign in with Supabase email and password. The Hub fetches your role; Studio and Press then load from Supabase on entry.

**Never put a database password, `service_role` key, `sb_secret_...` key, or management API token in frontend files.** Publishable keys are okay only with correctly configured RLS.

## How records migrate

The original apps are designed around browser localStorage. To preserve all existing functions, this package offers a **cloud JSON snapshot bridge** when Supabase mode is configured:
- Each workspace saves one JSON document in `public.workspace_snapshots` (`studio` / `press`).
- Data is loaded before each manager's original script executes.
- After a change, the app sends the new snapshot to Supabase.
- A revision check prevents another device's older snapshot from silently overwriting a newer one.
- If the cloud save fails or conflicts, the status label turns red. **Download the JSON backup from inside the app before refreshing or leaving**, then coordinate re-importing the correct version.
- In cloud mode, temporary record data is stored in `sessionStorage` while using the app, not persistent localStorage. Signing out clears the temporary data.

**This is not yet a fully normalized multi-user database.** It does not auto-merge two employees editing at the same time, support real-time collaborative row-level updates, or automatically import your preexisting records. For production multi-user editing, move transactions, jobs, payroll, and advances into dedicated Supabase tables, using row-level policies and transactional mutations.

### Migrating data from an existing browser installation

1. BEFORE switching the old system to Supabase, open the old Studio Manager and download its **full JSON backup**. Do the same for Press Manager.
2. Configure the new project and sign in as Owner in Cloud mode.
3. In each new Manager, open the existing Backup/Restore feature and restore the corresponding JSON file. The modified managers will upload restored data to Supabase; wait until the status says **Saved to Supabase**.
4. Open the other Manager, then reload after verifying its data. Keep the original JSON backups offline.

Do NOT simply paste old localStorage keys or user passwords into GitHub.

## Role behavior

- **Owner** — both workspaces; provision roles through the Supabase Dashboard.
- **Admin** — both workspaces.
- **Staff** — Press Manager only.

In cloud mode, access to the corresponding Supabase data is enforced by RLS; the static HTML/JS itself is publicly retrievable, as is normal for GitHub Pages. In local demo mode, role restrictions are user-interface checks only.

## Troubleshooting

- Blank login? Check Console and that all `.js` files were uploaded. Supabase SDK is loaded via CDN, so internet access is required.
- Login works, but `No active profile`? Insert a matching row in `public.user_profiles` using your Supabase SQL editor.
- RLS errors? Run `supabase-setup.sql` and check that your Auth user has a correct active role.
- `Cloud revision conflict`? Another session saved first. Export unsynced changes from your app; reopen and reconcile data deliberately.
- An old manager shows no data? Remember each browser origin has its own original localStorage. Import a JSON backup via the new manager.
- CSS broken? Confirm all style files are in the same directory as their HTML files. 

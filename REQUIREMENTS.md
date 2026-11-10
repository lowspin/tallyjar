# Tallyjar — Requirements

> A calm, friendly Progressive Web App for counting things. Users create **jars** (collections) and keep tallies of **items** inside them. No accounts: all data lives on the device in IndexedDB and can be exported and imported as JSON.

This document is the source of truth for building v1. Build it in the phases listed in §11, and check the acceptance criteria at the end of each phase before moving on.

---

## 1. Goals and non-goals

**Goals**

- Fast, one-thumb counting on a phone; also works on desktop.
- Installable PWA that works fully offline.
- Hosted for free on GitHub Pages under a sub-path (e.g. `https://<user>.github.io/tallyjar/`).
- Looks calm and inviting, with subtle motion.

**Non-goals (v1)**

- No authentication, sync or backend.
- No undo or history log.
- No negative counts.
- No sound.

---

## 2. Terminology

| Term in code | Term in UI | Meaning                                              |
| ------------ | ---------- | ---------------------------------------------------- |
| `Collection` | **Jar**    | A named, colored container of items. Shown as a tab. |
| `Item`       | **Item**   | A counted thing. Belongs to exactly one collection.  |

UI copy uses "jar" ("New jar", "Delete jar"). Code uses `collection`.

---

## 3. Tech stack

| Concern     | Choice                                                                                               | Notes                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Framework   | **Vue 3** + `<script setup>` + **TypeScript** (strict)                                               |                                                                                                |
| Build       | **Vite**                                                                                             | `base: './'` so all asset paths are relative                                                   |
| PWA         | **vite-plugin-pwa** (Workbox, `generateSW`, `registerType: 'prompt'`)                                | Precache all build assets. Show an "Update available — Reload" toast when a new SW is waiting. |
| State       | **Pinia**                                                                                            |                                                                                                |
| IndexedDB   | **Dexie.js** (v4)                                                                                    | Typed tables; use `liveQuery` or store-level reloads                                           |
| Drag & drop | **SortableJS** via `vuedraggable@next` _or_ VueUse `useSortable`                                     | Must work with touch (long-press to drag)                                                      |
| Utilities   | **@vueuse/core**                                                                                     | Optional, for `useDark`, `onLongPress` etc.                                                    |
| Styling     | Plain CSS with custom properties (design tokens). Optionally **Open Props** for easings and shadows. | **No** component library (no Vuetify)                                                          |
| Font        | System UI stack, _or_ self-hosted **Nunito** via `@fontsource-variable/nunito`                       | Numbers use `font-variant-numeric: tabular-nums`                                               |
| Icons       | Inline SVG icons (e.g. a handful copied from Lucide), no icon font                                   |                                                                                                |
| Tests       | **Vitest** + `fake-indexeddb` for the data layer and export/import                                   |                                                                                                |
| Lint/format | ESLint (vue + ts) + Prettier                                                                         |                                                                                                |

### 3.1 GitHub Pages constraints

- **Relative paths everywhere**: Vite `base: './'`; manifest `start_url: './'`, `scope: './'`; icon paths relative.
- **No history-mode routing** (Pages has no SPA fallback). The app is a single screen with modal sheets. If a router is used at all, use `createWebHashHistory`.
- Deploy with a GitHub Actions workflow (`.github/workflows/deploy.yml`) that runs `npm ci && npm run build` and publishes `dist/` using `actions/upload-pages-artifact` + `actions/deploy-pages` on push to `main`.

### 3.2 PWA manifest

- `name`: "Tallyjar", `short_name`: "Tallyjar"
- `display`: `standalone`, `orientation`: `any`
- `theme_color`: `#258484`, `background_color`: `#FDFAF4`
- Icons: 192, 512 and a 512 **maskable**, generated from a simple SVG jar logo (rounded jar with a few tally marks, primary teal on cream). Use `@vite-pwa/assets-generator` or a script to produce the PNGs. Also add `apple-touch-icon` and the iOS meta tags.

---

## 4. Data model

All IDs are strings from `crypto.randomUUID()`. Timestamps are epoch ms. Counts are **non-negative integers** with a maximum of `Number.MAX_SAFE_INTEGER` (≈ 9 × 10¹⁵), so billions are fine.

```ts
interface Collection {
  id: string
  name: string // 1–40 chars, trimmed
  color: string // hex "#RRGGBB"
  order: number // sort key for tabs
  createdAt: number
  updatedAt: number
}

type OnTarget = 'continue' | 'lock'

interface Item {
  id: string
  collectionId: string // exactly one collection
  name: string // 1–60 chars, trimmed
  color: string // hex "#RRGGBB"
  imageId: string | null // → images table
  count: number // current value, integer ≥ 0
  startCount: number // integer ≥ 0, default 0. "Reset" returns count to this.
  target: number | null // integer ≥ 1, or null = no target
  onTarget: OnTarget // only meaningful when target !== null. Default 'continue'
  step: number // integer ≥ 1, default 1
  order: number // sort key within the collection
  createdAt: number
  updatedAt: number
}

interface ImageBlob {
  id: string
  blob: Blob // resized WebP (fallback JPEG)
  width: number
  height: number
}

interface Settings {
  // single row, key = 'app'
  key: 'app'
  lastCollectionId: string | null
  theme: 'system' | 'light' | 'dark'
  lastExportAt: number | null
  persistRequested: boolean
  persisted: boolean | null // result of storage.persist(); null if unsupported
  backupReminderSnoozedUntil: number | null // backup banner hidden until then after dismissal
}
```

### 4.1 Dexie schema (v1)

```ts
db.version(1).stores({
  collections: 'id, order',
  items: 'id, collectionId, [collectionId+order]',
  images: 'id',
  settings: 'key',
})
```

Future schema changes go through Dexie version upgrades. Never edit v1 in place after release.

### 4.2 Rules

- Deleting a collection deletes **all of its items and their images** in a single Dexie transaction.
- Deleting an item deletes its image.
- Items cannot be moved between collections. They can be **duplicated** into any collection (including the same one). A duplicate copies every field except `id`, `collectionId`, `order` and timestamps, and gets its **own copy** of the image blob. The name gets no suffix when copied into a different collection, and " (copy)" when copied into the same one.
- New collections and items are appended at the end (`order = max + 1`).
- Reordering rewrites `order` for the affected list in one transaction (dense integers 0..n-1).

---

## 5. Counting behavior

### 5.1 Controls (on each item card)

- **−** and **+** buttons with ≥ 48 × 48 px tap targets.
- **Single tap = ±1. Double tap = ±`step`.** This lets the user jump in big steps, then fine-tune by 1 as they get close.
  - **No waiting to detect a double tap.** The first tap applies ±1 _immediately_. If a second tap on the same button lands within **300 ms**, it applies the remainder (±(`step` − 1)), so the double tap adds exactly `step` in total. Single taps never feel laggy.
  - The count "pop" animation shows a small floating label for the double-tap amount (e.g. "+200").
  - If `step === 1`, a double tap is just two single taps (+2 in total).
  - Clamping (§5.2) applies to each part separately. For example, if the first tap reaches a locked target, the second part is ignored.
  - When `step > 1`, each button shows a small hint with just the signed step under its icon, inside the button: "−200" on −, "+200" on +. Steps of 10,000 or more use compact notation ("+25K").
  - Set `touch-action: manipulation` on the buttons so mobile browsers don't double-tap-zoom.
  - **Desktop/keyboard equivalent:** Shift+click or Shift+Enter/Space = ±`step`. Plain click/Enter = ±1.
- **Press and hold** auto-repeats by **`step`**: starts after 400 ms and speeds up over time (e.g. 8/s rising to about 25/s). It stops on release, pointer leave, or when a limit is reached. Use pointer events so it works with both mouse and touch, and prevent the long-press context menu and text selection.
- **Tap the count number** to open a "Set count" sheet with a numeric input (`inputmode="numeric"`) for typing an exact value. It also shows quick buttons for **Reset to start (n)** and, if a target is set, **Set to target**.
- No slider.

### 5.2 Limits and clamping

- `count` never goes below **0**. − at 0 is disabled. A step that would cross 0 clamps to 0.
- `count` never exceeds `Number.MAX_SAFE_INTEGER`.
- **Target with `onTarget: 'lock'`**: once `count ≥ target`, **+** is disabled and replaced by a "Done ✓" state. A + that would overshoot clamps to `target`. A typed value above the target is clamped to the target, with a hint saying "Locked at target — change the target or switch to 'Keep counting' to go higher."
- **Target with `onTarget: 'continue'`**: counting continues past the target. The progress bar stays full and the card stays in its "reached" style.
- Counts are integers only. Strip separators from typed input and reject anything non-numeric.

### 5.3 Reset

- "Reset" (in the item menu and in the Set-count sheet) sets `count = startCount` after a confirmation.
- Changing `startCount` in the item editor does **not** change the current `count`. It only changes what Reset goes back to. Setting the start count to 0 is how a user gets "reset to zero".

### 5.4 Number display

- Show the full number with locale grouping (`Intl.NumberFormat`), e.g. `1,234,567`.
- If it doesn't fit the card width, fall back to compact notation (`1.2M`, `3.4B`) with the full value in the Set-count sheet and `aria-label`. Shorten the target first (`1,999 / 2K`) and the count only if that still doesn't fit, so rounding never makes an unfinished item look done.
- Progress text: `1,234 / 5,000` and a percentage.

### 5.5 Persistence of counts

- Update the UI immediately (optimistic) and write to IndexedDB with a short debounce (about 300 ms) during hold-to-repeat. Always flush on `visibilitychange`/`pagehide`.

---

## 6. Screens and UI

Single-screen app with bottom sheets / dialogs for editing.

### 6.1 Layout

```
┌───────────────────────────────────────┐
│ Tallyjar 🫙                  [⋯ menu] │  header (menu: Export, Import, Theme, About)
├───────────────────────────────────────┤
│ [Snacks] [Books] [Steps] [+]   ← → ⇆  │  jar tabs, horizontal scroll, drag to reorder
├───────────────────────────────────────┤
│ ┌───────────────────────────────────┐ │
│ │▌⋮⋮ [img] Almonds        [ − ][ + ] ⋮│ │  compact one-row item card (accent bar = item color);
│ │▌         1,240 / 2,000  [−200][+200]│ │  step hint inside the buttons (only when step > 1)
│ │▌         ████████░░ 62%             │ │
│ └───────────────────────────────────┘ │
│ ┌───────────────────────────────────┐ │
│ │ ...                               │ │  about 8 cards fit on a 390 × 844 phone screen
│ └───────────────────────────────────┘ │
│                              ( + Item )│  floating add button
└───────────────────────────────────────┘
```

- **About** shows the app version from `package.json` (`0.1.0` for now), injected at build time.

### 6.2 Jar tabs

- Horizontal, scrollable row of pill-shaped tabs. Each pill has a color dot (or is tinted with the jar color) and the jar name. The active tab is filled with the jar color.
- A trailing **[+]** pill creates a new jar.
- **Reorder** by long-press (touch) or click-drag (mouse). Animate the moves.
- Tap the active tab again (or long-press menu → Edit) to open the **Jar editor**: name, color (palette + custom picker), **Delete jar** (confirmation states how many items will be deleted).
- **On load, open the last active jar** (`settings.lastCollectionId`). If it no longer exists, open the first jar.
- Scroll the active tab into view on load and on change.

### 6.3 Item list

- Vertical list of cards for the active jar, sorted by `order`.
- **Reorder** by a drag handle (⋮⋮) on each card, so dragging doesn't fight with the count buttons or scrolling.
- Card menu (⋮): Edit, Reset, Duplicate to… (lists jars), Delete.
- Floating **+ Item** button opens the Item editor for the active jar.

### 6.4 Item card states

| State            | Visual                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Normal           | Soft tint of item color as background (≈12% light / 18% dark), 4–6 px solid accent bar on the left in the item color             |
| Has target       | Progress bar in item color, with `count / target` and %                                                                          |
| Target reached   | Card border in item color, a small ✓ badge, progress bar full with a gentle shimmer that plays once, count text weight increases |
| Reached + `lock` | As above, + replaced by a disabled "Done ✓" pill                                                                                 |
| No image         | Show a rounded square in item color with the item's first letter                                                                 |

### 6.5 Item editor (sheet)

Fields:

- Name (required)
- Color: the 25-swatch palette + "Custom" (native `<input type="color">`)
- Thumbnail: add / replace / remove. Accept `image/*`, using the camera on mobile via the file input.
- Start count (default 0). For new items, `count` initializes to `startCount`.
- Current count (edit only; same as the Set-count sheet)
- Step (default 1, integer ≥ 1), labelled "Double-tap step". Quick chips: 1, 5, 10, 100, 1,000.
- Target: toggle "Has target". When on, target number (≥ 1) and a segmented control: **Keep counting** (`continue`) / **Stop at target** (`lock`).
- **Suggested step:** when a target is entered for an item that had none before (new item or `target` was `null`), and the user hasn't changed the step field during this edit, **prefill the step with a suggested value**:
  - `range = max(target − startCount, 1)`
  - `raw = range × 0.10` (10% of the range)
  - Round **down** to the nearest "nice" number in the 1-2-5 series (1, 2, 5, 10, 20, 50, 100, …), minimum 1.
  - Examples: target 2,000 from 0 → step 200; target 75 → 5; target 1,000,000 → 100,000; target 8 → 1.
  - Show a hint: "Suggested from your target. Change it anytime." Saving with the prefilled value is fine. The suggestion is a UI prefill only and isn't stored separately.
  - Changing the target later does **not** recalculate the step. Put `suggestStep(startCount, target)` in `lib/` with unit tests.

Validation messages are inline. Save is disabled while the form is invalid.

### 6.6 Empty states

- No jars: friendly illustration (the jar logo) + "Create your first jar" button.
- Jar with no items: "This jar is empty — add something to count" + button.

### 6.7 Thumbnails

- On upload, decode with `createImageBitmap`, center-crop to a square, resize to **256 × 256**, encode as WebP at quality 0.8 (fall back to JPEG if WebP encoding isn't supported, e.g. older Safari), and store in `images`.
- Use object URLs for display. Revoke them when the image is replaced or removed and when the component unmounts.

---

## 7. Export / Import

### 7.1 Export

- Menu → **Export backup**. No options: thumbnails are **always** included.
- Downloads `tallyjar-backup-YYYY-MM-DD.json`. On mobile, use the Web Share API with the file if it's available, otherwise a download link.
- Update `settings.lastExportAt`.

Format:

```json
{
  "app": "tallyjar",
  "schemaVersion": 1,
  "exportedAt": "2026-11-10T16:00:00.000Z",
  "collections": [
    { "id": "…", "name": "…", "color": "#5EC4C4", "order": 0, "createdAt": 0, "updatedAt": 0 }
  ],
  "items": [
    {
      "id": "…",
      "collectionId": "…",
      "name": "…",
      "color": "#…",
      "count": 0,
      "startCount": 0,
      "target": null,
      "onTarget": "continue",
      "step": 1,
      "order": 0,
      "createdAt": 0,
      "updatedAt": 0,
      "image": null
    }
  ]
}
```

- `image` is `null` when the item has no thumbnail, otherwise `{ "mime": "image/webp", "width": 256, "height": 256, "data": "<base64>" }`.
- `imageId` is not exported.

### 7.2 Import

- Menu → **Import backup** → file picker (`.json`).
- Validate: `app === "tallyjar"`, a known `schemaVersion`, field types and ranges (clamp or reject bad values), and that every item's `collectionId` exists. Show a clear error and change nothing if validation fails.
- Show a summary ("3 jars, 41 items, 12 images") and ask the user to choose:
  - **Replace everything**: wipe all tables, then import.
  - **Add as new**: import with **fresh IDs** (remap `collectionId`s) appended after the existing jars. Nothing existing is touched.
- The whole import runs in one Dexie transaction.
- Imported items without images show the letter placeholder.

### 7.3 Data safety

- On first launch, call `navigator.storage.persist()` and record the result.
- If `lastExportAt` is null or more than 30 days old **and** the user has at least 10 items, show a dismissible banner: "Your counts live only on this device. Export a backup?" Dismissing it hides it for 14 days (`settings.backupReminderSnoozedUntil`).
- On iOS Safari when not installed (`!matchMedia('(display-mode: standalone)').matches`), show a one-time tip to "Add to Home Screen" so storage is less likely to be evicted.

---

## 8. Design system

Mood: **calm, warm, inviting**. Think of a sea-glass jar on a cream countertop. Soft, muted colors, generous spacing, rounded corners, gentle shadows.

### 8.1 Tokens

| Token                | Light                                                                      | Dark                                            |
| -------------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| `--color-primary`    | `#258484`                                                                  | `#5DB5B5`                                       |
| `--color-on-primary` | `#FFFFFF`                                                                  | `#0F171C`                                       |
| `--color-bg`         | `#FDFAF4` (warm cream)                                                     | `#0F171C` (deep blue-slate)                     |
| `--color-surface`    | `#FFFFFF`                                                                  | `#192329`                                       |
| `--color-text`       | `#243036`                                                                  | `#EBE7E0`                                       |
| `--color-text-muted` | `#243036` @ 65%                                                            | `#EBE7E0` @ 65%                                 |
| `--color-success`    | `#4A9A5E`                                                                  | `#82C393`                                       |
| `--radius-card`      | 16px                                                                       |                                                 |
| `--radius-pill`      | 999px                                                                      |                                                 |
| `--shadow-card`      | soft, low (e.g. `0 1px 2px rgb(0 0 0 / .06), 0 4px 12px rgb(0 0 0 / .05)`) | none; use a 1px border `rgb(255 255 255 / .06)` |
| Spacing scale        | 4, 8, 12, 16, 24, 32                                                       |                                                 |

- Theme: `system` by default (`prefers-color-scheme`), with a manual override in the menu. Apply it via `data-theme` on `<html>` and set `<meta name="theme-color">` to match.

### 8.2 Default palette (25 colors)

Generated in OKLCH at a constant lightness and chroma (L 0.76, C 0.095), with hues spaced 14.4° apart starting at the brand teal (195°). Because every swatch has the same lightness and saturation, any combination looks harmonious. Show it as a **5 × 5 grid** in this order:

```
#5EC4C4  #5FC2D2  #67BEDE  #75BAE7  #85B5EC
#96B0EE  #A6AAEC  #B6A5E7  #C4A0DE  #D09CD3
#DA9AC5  #E198B6  #E698A6  #E79996  #E69C86
#E2A079  #DBA56F  #D1AA69  #C5B068  #B6B66D
#A6BB77  #94C084  #82C393  #72C5A3  #65C5B4
```

- New jars and items default to the **next unused palette color** (cycling) so new things look distinct.
- Users can choose any custom hex with the native color picker. Show the chosen custom color as a 26th selected swatch.
- **Text on a colored fill**: pick dark (`#243036`) or light (`#FFFFFF`) by WCAG contrast. All 25 defaults take dark text. Accent bars and progress fills use the color directly. Card backgrounds use it at low alpha: `color-mix(in oklch, <color> 12%, var(--color-surface))` in light mode and `color-mix(in oklch, <color> 18%, var(--color-surface))` in dark mode (define the percentage as a token, `--tint-card`, so the themes only differ in that value).

### 8.3 Motion

Subtle and quick (150–250 ms, ease-out). **No sound.**

- Count change: the number does a small scale pop (1 → 1.08 → 1) plus a slight vertical slide.
- Progress bar: width transitions over 250 ms.
- Target reached: one-time border glow plus the ✓ badge scaling in. No confetti.
- List add/remove/reorder: `<TransitionGroup>` fade + move.
- Tab switch: item list crossfades / slides slightly in the direction of the tab change.
- Sheets: slide up with a backdrop fade.
- Wrap all non-essential motion in `@media (prefers-reduced-motion: no-preference)`.
- Optional: `navigator.vibrate(10)` on reaching the target (Android only, behind a feature check).

### 8.4 Accessibility

- All controls reachable by keyboard, with visible focus rings.
- Count buttons have `aria-label` ("Add 1 to Almonds; double-tap or Shift to add 200"). The count region uses `aria-live="polite"`.
- Progress bar uses `role="progressbar"` with `aria-valuenow/min/max`.
- Text contrast is at least 4.5:1 in both themes.
- Drag-to-reorder has a fallback: "Move up / Move down" in the card and tab menus.

---

## 9. Project structure (suggested)

```
tallyjar/
├─ .github/workflows/deploy.yml
├─ public/                 # icons, favicon
├─ src/
│  ├─ main.ts
│  ├─ App.vue
│  ├─ db/
│  │  ├─ db.ts             # Dexie instance + schema
│  │  ├─ repo.ts           # CRUD, reorder, duplicate, cascade delete
│  │  └─ backup.ts         # export / import / validation
│  ├─ stores/
│  │  ├─ collections.ts
│  │  ├─ items.ts
│  │  └─ settings.ts
│  ├─ components/
│  │  ├─ AppHeader.vue
│  │  ├─ JarTabs.vue
│  │  ├─ ItemList.vue
│  │  ├─ ItemCard.vue
│  │  ├─ CountButton.vue   # hold-to-repeat logic
│  │  ├─ ProgressBar.vue
│  │  ├─ ColorPicker.vue   # palette grid + custom
│  │  ├─ ImageInput.vue
│  │  ├─ BottomSheet.vue
│  │  ├─ ConfirmDialog.vue
│  │  └─ editors/ (JarEditor.vue, ItemEditor.vue, SetCountSheet.vue, ImportDialog.vue, ExportDialog.vue)
│  ├─ lib/
│  │  ├─ palette.ts        # 25 colors + contrast helper
│  │  ├─ format.ts         # number formatting
│  │  ├─ image.ts          # resize/encode
│  │  └─ clamp.ts          # count rules (pure, unit-tested)
│  └─ styles/
│     ├─ tokens.css
│     └─ base.css
├─ tests/
├─ index.html
├─ vite.config.ts
└─ README.md
```

Keep the counting rules in §5.2 in **pure functions** (`lib/clamp.ts`) with unit tests that cover zero, the lock target, overshoot and `MAX_SAFE_INTEGER`.

---

## 10. Performance and quality targets

- Lighthouse PWA installable; Performance ≥ 90 on mobile.
- Smooth with 50 jars × 200 items each. Use lazy image decoding; virtualization isn't required in v1.
- Works offline after the first load, including adding images.
- Tested on: iOS Safari (installed and browser), Android Chrome, desktop Chrome/Firefox/Safari.

---

## 11. Build phases and acceptance criteria

**Phase 1: Scaffold and deploy**

- Vite + Vue + TS + Pinia + vite-plugin-pwa + ESLint/Prettier + Vitest.
- Design tokens, light/dark themes, header with menu.
- GitHub Actions deploy to Pages.
- ✅ The deployed app loads from the `/tallyjar/` sub-path, can be installed, works offline, and switches theme.

**Phase 2: Data layer**

- Dexie schema, repository functions, Pinia stores, `storage.persist()`.
- ✅ Unit tests pass for CRUD, cascade delete, duplicate (with image copy) and reorder.

**Phase 3: Jars (tabs)**

- Create, edit, delete and reorder jars; palette color picker; remember the last tab.
- ✅ Reloading reopens the last jar; deleting a jar removes its items.

**Phase 4: Items and counting**

- Item editor, cards, −/+ (single tap ±1, double tap ±step, Shift = step), hold-to-repeat, suggested step from target, Set-count sheet, targets, lock/continue, reset, duplicate, delete, reorder, thumbnails.
- ✅ All rules in §5 hold, including the clamping and `suggestStep` unit tests; single taps respond with no delay; the target-reached visual appears; images survive a reload.

**Phase 5: Export / Import**

- Export (always with thumbnails); import with Replace and Add-as-new; validation; backup reminder banner.
- ✅ A round trip (export → wipe → import with Replace) reproduces the same jars and items, with identical images, compared field by field. `imageId` values are freshly generated and settings are not part of the backup, so those are excluded from the comparison. A malformed file changes nothing.

**Phase 6: Polish**

- Animations (§8.3), empty states, a11y pass (§8.4), update-available toast, iOS install tip, icons.
- ✅ Lighthouse targets met; reduced-motion respected.

---

## 12. Future ideas (out of scope for v1)

- Undo / change history with timestamps
- Optional cloud sync (e.g. Firebase) with sign-in
- Count history charts
- Sharing a jar as a link
- Per-item notes, units ("pages", "km")

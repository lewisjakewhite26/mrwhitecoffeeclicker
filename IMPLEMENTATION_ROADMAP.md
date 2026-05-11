# Bishopton Empire — implementation roadmap

This document lists what is worth implementing for **Mr White’s Bishopton Empire** (coffee / Durham identity preserved), **why**, and a rough **effort** estimate. It draws on two public references:

| Source | What it actually is | Useful for your game? |
|--------|---------------------|-------------------------|
| [than1089/adventure-capitalist](https://github.com/than1089/adventure-capitalist) | React + Redux **idle clone** with README on timers, managers, persistence, offline-style catch-up | **Yes — primary mechanics reference** |
| [seanpm2001/SeansLifeArchive_Images_AdVenture-Capitalist_Website](https://github.com/seanpm2001/SeansLifeArchive_Images_AdVenture-Capitalist_Website) | **Static / archive “mini website”** (HTML, docs, images, GPL meta) around an AdCap-related *image* sub-project — not a full game simulation | **Low — publishing & assets only** |

Effort key: **S** = ~0.5–1 dev day, **M** = ~2–4 days, **L** = ~1+ weeks (assuming one developer familiar with your current Vite + React codebase).

---

## Tier 1 — implement first (biggest player payoff)

### 1. Offline / away earnings (wall-clock catch-up)

- **What:** On load, compare `Date.now()` to a stored `lastClosedAt` (and optionally last known game snapshot). For each **managed** business with a known run start + duration, advance cycles that would have completed while the tab was closed; credit `balance` / `lifetime`; leave partial progress on the bar/timer.
- **Why:** Matches the behaviour described in the than1089 README (`store.js` + `game.js` idea). Makes managers feel honest and removes the “punished for closing the tab” feeling. Core AdCap-style trust.
- **How:** New fields in save JSON; one pure function `applyOfflineDelta(game, nowMs)` called once at boot before the RAF loop; cap offline window (e.g. 24–72h) to avoid exploits / float issues.
- **Effort:** **M** (careful edge cases: rebirth, collect-ready, milestone math, first install).

### 2. Buy quantity controls (×1 / ×10 / ×100 / Max)

- **What:** Toggle or buttons for how many **levels** to buy at once on each business row; “Max” spends until broke or next milestone if you want a variant.
- **Why:** Listed as a to-do in than1089; standard idle QoL once costs explode. Reduces tap fatigue without changing theme.
- **Effort:** **S–M** (UI + loop subtracting cost until count or funds exhausted; test with milestone toasts).

### 3. Persist `lastClosedAt` + heartbeat save

- **What:** `beforeunload` / `visibilitychange` (hidden) writes timestamp + `saveGame`; optional 30s heartbeat if you want less reliance on unload events (mobile kills tabs silently).
- **Why:** Prerequisite for reliable offline math; complements your existing 5s save in the loop.
- **Effort:** **S** (small addition to `saveGame` / `loadGame`; bump save schema version once).

---

## Tier 2 — polish & depth (still on-brand)

### 4. “While you were away” summary modal

- **What:** After offline calc, one dismissible card: “You were gone Xh Ym · +£Z from automated businesses.”
- **Why:** Rewards the feature emotionally; pure UX, still Mr White / coffee copy.
- **Effort:** **S** (depends on Tier 1).

### 5. Settings: number format / animations / reduced motion

- **What:** Toggles for `prefers-reduced-motion`, shorter toasts, optional compact rows.
- **Why:** Accessibility and long sessions; no conflict with theme.
- **Effort:** **S**.

### 6. Balancing pass + telemetry hooks (local only)

- **What:** Tune milestone / rebirth curves after offline income exists; optional `localStorage` log of “session earnings” for your own tuning.
- **Why:** Offline income changes economy speed; one rebalance avoids trivialising mid-game.
- **Effort:** **M** (design + playtest iterations).

---

## Tier 3 — optional / marketing (Sean-style repo territory)

### 7. Static “press kit” or credits page (separate route or second HTML)

- **What:** Simple `credits.html` or Vite route: your branding, Durham/Bishopton flavour text, asset credits, link to GitHub.
- **Why:** Similar *role* to the Sean archive site (documentation + presentation), not gameplay. Good if you ship GitHub Pages.
- **Effort:** **S** (no game logic).

### 8. Image assets (logos, beans, shop fronts)

- **What:** Replace or supplement Lucide icons with bespoke PNG/WebP for header and rows.
- **Why:** than1089 README notes CSS-only limits; Sean repo is image-oriented. Stronger identity for “Mr White’s coffee empire.”
- **Effort:** **M–L** (depends on art pipeline; code integration is **S** once assets exist).

### 9. GPL / licence hygiene if you copy *files* from Sean’s repo

- **What:** That project is **GPL-3.0**. Do **not** paste GPL HTML/docs into a proprietary repo without a licence strategy. Prefer original copy and your own MIT/unlicensed game code.
- **Why:** Avoid licence contamination; Sean’s value is not game code anyway.
- **Effort:** **S** (legal clarity only).

---

## Explicitly *not* worth importing from Sean’s game-image website repo

- **Core idle loop, managers, angels, milestones:** not present as a maintained game there — keep using **your** `bishopton-empire-react.jsx` + than1089-style ideas.
- **Redux rewrite:** than1089 uses Redux; you do not need it unless the codebase becomes hard to reason about (**L** churn for little gain today).

---

## Suggested order of work

1. Persist timestamps + save version bump (**S**).  
2. Offline earnings core + tests / manual matrix (**M**).  
3. “While you were away” toast or modal (**S**).  
4. Buy ×10 / Max (**S–M**).  
5. Balance pass (**M**).  
6. Optional static credits / GitHub Pages (**S**).  
7. Custom art when you have assets (**M–L**).

---

## References

- than1089 clone (mechanics, README on time-based progress):  
  https://github.com/than1089/adventure-capitalist  
- SeanPM2001 archive mini-site (HTML / images / GPL meta — **not** a gameplay reference):  
  https://github.com/seanpm2001/SeansLifeArchive_Images_AdVenture-Capitalist_Website  

---

*Generated for planning; adjust estimates to your actual schedule and scope.*

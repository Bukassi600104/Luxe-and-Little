# Dashboard Stock Chart And Tab Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dashboard stock-value chart cards and improve bottom tab bar visibility with an embossed center Sales action.

**Architecture:** Reuse the existing `profitView.current` derived from products. Pass it to `Dashboard`, render a compact horizontal chart and value cards, then adjust tab bar CSS only. Bump app/cache versions for installed PWA refresh.

**Tech Stack:** React 19, Vite, CSS, Dexie/IndexedDB, lucide-react.

---

### Task 1: Dashboard Stock Value Chart

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/styles.css`

- [ ] Pass `profitView.current` into `Dashboard`.
- [ ] Add `StockValueChart` component with Cost Value, Selling Value, Expected Profit.
- [ ] Add compact chart styles and mini-value cards.

### Task 2: Bottom Navigation Polish

**Files:**
- Modify: `src/styles.css`

- [ ] Move `.tabbar` upward so labels are visible.
- [ ] Make center Sales tab larger, raised, more solid, and embossed.
- [ ] Keep layout stable and labels readable.

### Task 3: Version, Verify, Commit

**Files:**
- Modify: `package.json`
- Modify: `public/sw.js`
- Modify: `src/db.js`
- Modify: `src/main.jsx`

- [ ] Bump app version to `1.0.8`.
- [ ] Bump service worker cache to `llt-manager-v6`.
- [ ] Run `npm run build`.
- [ ] Verify browser install gate has no console errors.
- [ ] Commit and push.


# Today's Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-product immediate-sale flow with multi-line orders that reserve stock while pending, count revenue only when sold, and provide in-app cleanup/edit controls.

**Architecture:** Continue using the existing Dexie `sales` table to avoid a risky migration. New records become order-shaped sales with an `items` array, `status`, receipt metadata, totals, and profit. Existing single-product records are treated as sold orders for compatibility.

**Tech Stack:** React 19, Dexie/IndexedDB, Vite, CSS, jsPDF.

---

### Task 1: Order Data Helpers

**Files:**
- Modify: `src/db.js`
- Modify: `src/main.jsx`

- [ ] Add helpers to normalize old single-product sales into order-like records.
- [ ] Add DB operations to create pending orders, update status, delete orders, and edit orders.
- [ ] Ensure pending reserves stock, sold counts revenue, cancelled restores stock once.

### Task 2: Multi-Line Record Sale

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/styles.css`

- [ ] Replace one-product sale state with `orderLines`.
- [ ] Add `+` button for additional product lines.
- [ ] Each line supports product, editable size, quantity, and removal.
- [ ] Save creates one pending order with multiple items.

### Task 3: Today's Orders Screen

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/styles.css`

- [ ] Add `Today` view under More.
- [ ] Show pending/sold/cancelled cards for today's records.
- [ ] Add Mark Sold, Cancel, Delete, Edit, and Receipt actions.
- [ ] Existing old records without status display as sold.

### Task 4: Receipt And Totals

**Files:**
- Modify: `src/main.jsx`

- [ ] Receipt shows all order lines.
- [ ] Share Receipt marks `receiptGenerated` and `receiptSharedAt`.
- [ ] Dashboard, Reports, Profit View, and Sales History count only sold records for revenue/profit.
- [ ] Pending records count under Pending Orders.

### Task 5: Verify And Release

**Files:**
- Modify: `package.json`
- Modify: `public/sw.js`
- Modify: `src/db.js`

- [ ] Bump app version to `1.1.0`.
- [ ] Bump service worker cache to `llt-manager-v8`.
- [ ] Run `npm run build`.
- [ ] Run `npm audit --audit-level=moderate`.
- [ ] Verify preview install gate has no console errors.
- [ ] Commit and push.


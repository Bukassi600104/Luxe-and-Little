# Profit View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Profit View to show current inventory valuation, sold-items profit, and live product profit previews.

**Architecture:** Keep calculations client-side and derived from existing `products` and `sales` state. Add small helper functions in `src/main.jsx`, a third Reports segment, a `ProfitView` component, and CSS for valuation rows/cards. No IndexedDB schema migration.

**Tech Stack:** React 19, Vite, Dexie/IndexedDB, CSS modules via `src/styles.css`, lucide-react icons.

---

### Task 1: Add Profit Calculation Helpers

**Files:**
- Modify: `src/main.jsx`

- [ ] **Step 1: Add numeric and valuation helpers near `defaultSettings`**

```jsx
function toMoneyNumber(value) {
  return Number(value || 0);
}

function productValuation(product) {
  const quantity = toMoneyNumber(product.qty);
  const cost = toMoneyNumber(product.cost);
  const price = toMoneyNumber(product.price);
  const unitProfit = price - cost;
  const totalCost = cost * quantity;
  const totalSelling = price * quantity;
  const expectedProfit = unitProfit * quantity;
  const margin = totalSelling > 0 ? expectedProfit / totalSelling : 0;

  return { quantity, cost, price, unitProfit, totalCost, totalSelling, expectedProfit, margin };
}

function buildProfitView(products, sales) {
  const productRows = products.map((product) => ({ product, ...productValuation(product) }));
  const current = productRows.reduce(
    (acc, row) => ({
      totalCost: acc.totalCost + row.totalCost,
      totalSelling: acc.totalSelling + row.totalSelling,
      expectedProfit: acc.expectedProfit + row.expectedProfit
    }),
    { totalCost: 0, totalSelling: 0, expectedProfit: 0 }
  );
  current.margin = current.totalSelling > 0 ? current.expectedProfit / current.totalSelling : 0;

  const sold = sales.reduce(
    (acc, sale) => {
      const revenue = toMoneyNumber(sale.total);
      const profit = toMoneyNumber(sale.profit);
      return {
        revenue: acc.revenue + revenue,
        profit: acc.profit + profit,
        cost: acc.cost + Math.max(0, revenue - profit)
      };
    },
    { revenue: 0, cost: 0, profit: 0 }
  );
  sold.margin = sold.revenue > 0 ? sold.profit / sold.revenue : 0;

  return { current, sold, productRows };
}
```

- [ ] **Step 2: Use `buildProfitView(products, sales)` in `App`**

```jsx
const profitView = useMemo(() => buildProfitView(products, sales), [products, sales]);
```

### Task 2: Add Profit View UI

**Files:**
- Modify: `src/main.jsx`

- [ ] **Step 1: Pass `profitView` into `Reports`**

```jsx
<Reports
  totals={totals}
  profitView={profitView}
  ...
/>
```

- [ ] **Step 2: Add `profitView` prop and third segment**

```jsx
function Reports({ totals, profitView, expenses, ... }) {
  const [view, setView] = useState('expenses');

  return (
    <div className="stack">
      <div className="segmented glass three-way">
        <button className={view === 'expenses' ? 'selected' : ''} onClick={() => setView('expenses')}>Expenses</button>
        <button className={view === 'reports' ? 'selected' : ''} onClick={() => setView('reports')}>Reports</button>
        <button className={view === 'profit' ? 'selected' : ''} onClick={() => setView('profit')}>Profit View</button>
      </div>
      ...
      {view === 'profit' && <ProfitView profitView={profitView} sales={sales} />}
    </div>
  );
}
```

- [ ] **Step 3: Add `ProfitView` component**

```jsx
function ProfitView({ profitView, sales }) {
  const { current, sold, productRows } = profitView;

  return (
    <div className="profit-view">
      <div className="section-title"><h2>Current Stock</h2></div>
      <div className="metric-grid">
        <Metric title="Cost Value" value={money.format(current.totalCost)} note="Remaining stock" icon={<Archive />} tone="lemon" />
        <Metric title="Selling Value" value={money.format(current.totalSelling)} note="If all stock sells" icon={<ShoppingBag />} tone="pink" />
        <Metric title="Expected Profit" value={money.format(current.expectedProfit)} note="Selling minus cost" icon={<Sparkles />} tone="purple" />
        <Metric title="Margin" value={`${Math.round(current.margin * 100)}%`} note="On stock value" icon={<BarChart3 />} tone="lavender" />
      </div>
      <div className="section-title"><h2>Sold Items</h2></div>
      <div className="metric-grid">
        <Metric title="Sold Revenue" value={money.format(sold.revenue)} note="Completed sales" icon={<WalletCards />} tone="pink" />
        <Metric title="Sold Cost" value={money.format(sold.cost)} note="Derived from sales" icon={<ClipboardList />} tone="lemon" />
        <Metric title="Sold Profit" value={money.format(sold.profit)} note="Recorded profit" icon={<Sparkles />} tone="purple" />
        <Metric title="Sold Margin" value={`${Math.round(sold.margin * 100)}%`} note="Profit over sales" icon={<BarChart3 />} tone="lavender" />
      </div>
      <div className="report-card glass">
        <h2>Product Profit</h2>
        {productRows.length === 0 && <EmptyState title="No products yet" text="Add products to see stock profit values." />}
        {productRows.map((row) => (
          <div className="profit-row" key={row.product.id}>
            <div>
              <strong>{row.product.name || 'Unnamed Product'}</strong>
              <span>{row.quantity} left - {money.format(row.unitProfit)} profit each</span>
            </div>
            <div>
              <strong className={row.expectedProfit < 0 ? 'warning' : 'good'}>{money.format(row.expectedProfit)}</strong>
              <span>{money.format(row.totalCost)} cost / {money.format(row.totalSelling)} sell</span>
            </div>
          </div>
        ))}
      </div>
      <div className="report-card glass">
        <h2>Recent Sold Profit</h2>
        {sales.length === 0 && <EmptyState title="No sales yet" text="Sold profit appears after recording sales." />}
        {sales.slice(0, 6).map((sale) => (
          <div className="profit-row" key={sale.id}>
            <div>
              <strong>{sale.productName}</strong>
              <span>{sale.quantity} sold to {sale.customerName}</span>
            </div>
            <div>
              <strong className={Number(sale.profit || 0) < 0 ? 'warning' : 'good'}>{money.format(sale.profit || 0)}</strong>
              <span>{money.format(Math.max(0, Number(sale.total || 0) - Number(sale.profit || 0)))} cost / {money.format(sale.total || 0)} sold</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Task 3: Add Product Sheet Live Profit Preview

**Files:**
- Modify: `src/main.jsx`

- [ ] **Step 1: Calculate draft valuation in `ProductSheet`**

```jsx
const draftValuation = productValuation(draft);
```

- [ ] **Step 2: Render preview before Save Product**

```jsx
<div className="profit-preview glass">
  <div>
    <span>Profit per item</span>
    <strong className={draftValuation.unitProfit < 0 ? 'warning' : ''}>{money.format(draftValuation.unitProfit)}</strong>
  </div>
  <div>
    <span>Total expected profit</span>
    <strong className={draftValuation.expectedProfit < 0 ? 'warning' : ''}>{money.format(draftValuation.expectedProfit)}</strong>
  </div>
</div>
```

### Task 4: Add Styling And Verify

**Files:**
- Modify: `src/styles.css`
- Modify: `package.json`, `src/main.jsx`, `src/db.js`, `public/sw.js` for version/cache bump

- [ ] **Step 1: Add CSS**

```css
.segmented.three-way {
  grid-template-columns: repeat(3, 1fr);
}

.segmented.three-way button {
  font-size: 12px;
}

.profit-view {
  display: grid;
  gap: 12px;
}

.profit-row {
  min-height: 62px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid rgba(125, 93, 132, 0.1);
}

.profit-row:last-child {
  border-bottom: 0;
}

.profit-row div {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.profit-row div:last-child {
  justify-items: end;
  text-align: right;
}

.profit-row span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}

.profit-preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
}

.profit-preview div {
  display: grid;
  gap: 4px;
}

.profit-preview span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 750;
}
```

- [ ] **Step 2: Bump app version to `1.0.7` and service worker cache to `llt-manager-v5`**

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Verify install gate**

Open `http://127.0.0.1:5176/` in the in-app browser and confirm the install-only screen still renders with no console errors.

- [ ] **Step 5: Commit and push**

```bash
git add docs/superpowers/plans/2026-05-21-profit-view.md package.json public/sw.js src/db.js src/main.jsx src/styles.css
git commit -m "Add Profit View"
git push origin main
```


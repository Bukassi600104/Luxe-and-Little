import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ClipboardList,
  Download,
  Edit3,
  Home,
  Menu,
  Minus,
  PackagePlus,
  Plus,
  Search,
  Settings,
  Share2,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  WalletCards,
  X
} from 'lucide-react';
import {
  db,
  clearBusinessData,
  exportBusinessData,
  getBusinessSettings,
  getSecuritySettings,
  importBusinessData,
  recordSale,
  removeCustomer,
  removeExpense,
  removeProduct,
  saveBusinessSettings,
  saveCustomer,
  saveExpense,
  saveProduct,
  saveSecuritySettings,
  verifyPin
} from './db';
import './styles.css';

const money = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0
});

const today = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
}).format(new Date());
const expenseColors = {
  Packaging: '#9f5be8',
  Delivery: '#f5c843',
  Ads: '#ff399c',
  Restocking: '#98d72f',
  Miscellaneous: '#b985ff'
};

const defaultSettings = {
  stockCategories: ['Kiddies Wear', 'Sneakers', 'Shoes'],
  sizeTypes: ['Age Sizes', 'Numeric Sizes'],
  expenseCategories: ['Packaging', 'Delivery', 'Ads', 'Restocking', 'Miscellaneous'],
  lowStockThreshold: 10
};

const appVersion = '1.0.5';

async function seedDatabase() {
  await db.open();
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isStandalone] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator?.standalone === true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [sales, setSales] = useState([]);
  const [lastSale, setLastSale] = useState(null);
  const [settings, setSettings] = useState(null);
  const [saleQty, setSaleQty] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState('');
  const [productDraft, setProductDraft] = useState(null);
  const [expenseDraft, setExpenseDraft] = useState(null);
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [customerDraft, setCustomerDraft] = useState(null);
  const [security, setSecurity] = useState(null);
  const [pinDraft, setPinDraft] = useState('');
  const [pinError, setPinError] = useState('');
  const [stockNoticeDismissed, setStockNoticeDismissed] = useState(false);
  const [saleNotice, setSaleNotice] = useState(null);

  const selectedProduct = products.find((item) => item.id === Number(selectedProductId)) || products[0] || null;
  const selectedCustomer = customers.find((item) => item.phone === selectedCustomerPhone) || customers[0] || null;
  const saleTotal = selectedProduct ? selectedProduct.price * saleQty : 0;
  const saleProfit = selectedProduct ? (selectedProduct.price - selectedProduct.cost) * saleQty : 0;
  const lowStockThreshold = Number(settings?.lowStockThreshold || defaultSettings.lowStockThreshold);
  const lowStockItems = useMemo(
    () => products.filter((item) => Number(item.qty || 0) <= lowStockThreshold),
    [products, lowStockThreshold]
  );

  useEffect(() => {
    if (!isStandalone || !showSplash) return;
    const timer = window.setTimeout(() => setShowSplash(false), 1300);
    return () => window.clearTimeout(timer);
  }, [isStandalone, showSplash]);

  useEffect(() => {
    if (!isStandalone || !security?.pinHash || !isUnlocked) return;
    const idleLimitMs = 5 * 60 * 1000;

    function markActive() {
      localStorage.setItem('llt-last-active', String(Date.now()));
    }

    function lockIfIdle() {
      const lastActive = Number(localStorage.getItem('llt-last-active') || Date.now());
      if (Date.now() - lastActive > idleLimitMs) {
        setIsUnlocked(false);
        setPinDraft('');
        setShowSplash(true);
      } else {
        markActive();
      }
    }

    markActive();
    window.addEventListener('pointerdown', markActive);
    window.addEventListener('keydown', markActive);
    window.addEventListener('focus', lockIfIdle);
    document.addEventListener('visibilitychange', lockIfIdle);

    return () => {
      window.removeEventListener('pointerdown', markActive);
      window.removeEventListener('keydown', markActive);
      window.removeEventListener('focus', lockIfIdle);
      document.removeEventListener('visibilitychange', lockIfIdle);
    };
  }, [isStandalone, isUnlocked, security]);

  const totals = useMemo(() => {
    const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const stock = products.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const salesTotal = sales.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const profitTotal = sales.reduce((sum, item) => sum + Number(item.profit || 0), 0);
    const bestProduct = sales.length
      ? sales.reduce((acc, sale) => {
          acc[sale.productName] = (acc[sale.productName] || 0) + Number(sale.quantity || 0);
          return acc;
        }, {})
      : {};
    const bestName = Object.entries(bestProduct).sort((a, b) => b[1] - a[1])[0]?.[0] || 'No sales yet';

    return {
      todaySales: salesTotal,
      todayExpenses: expenseTotal,
      monthlyRevenue: salesTotal,
      netProfit: profitTotal - expenseTotal,
      expenses: expenseTotal,
      stock,
      low: products.filter((item) => Number(item.qty) <= Number(settings?.lowStockThreshold || 10)).length,
      bestName,
      pendingOrders: sales.length
    };
  }, [expenses, products, sales, settings]);

  useEffect(() => {
    if (!saleNotice) return;
    const timer = window.setTimeout(() => setSaleNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [saleNotice]);

  useEffect(() => {
    let active = true;

    async function loadPhoneStorage() {
      await seedDatabase();
      const [storedProducts, storedCustomers, storedExpenses, storedSales, storedSettings, storedSecurity] = await Promise.all([
        db.products.toArray(),
        db.customers.toArray(),
        db.expenses.toArray(),
        db.sales.reverse().toArray(),
        getBusinessSettings(),
        getSecuritySettings()
      ]);

      if (!active) return;
      setProducts(storedProducts);
      setCustomers(storedCustomers);
      setExpenses(storedExpenses);
      setSales(storedSales);
      setSettings(storedSettings || { ...defaultSettings, setupComplete: false });
      setSecurity(storedSecurity || null);
      setSelectedProductId(storedProducts[0]?.id || '');
      setSelectedCustomerPhone(storedCustomers[0]?.phone || '');
      setLastSale(storedSales[0] || null);
    }

    loadPhoneStorage();
    return () => {
      active = false;
    };
  }, []);

  async function unlock() {
    if (security?.pinHash && !(await verifyPin(pinDraft, security))) {
      setPinError('Incorrect PIN');
      return;
    }
    setIsUnlocked(true);
    setPinError('');
    localStorage.setItem('llt-last-active', String(Date.now()));
  }

  async function reloadBusinessData() {
    const [storedProducts, storedCustomers, storedExpenses, storedSales] = await Promise.all([
      db.products.toArray(),
      db.customers.toArray(),
      db.expenses.toArray(),
      db.sales.reverse().toArray()
    ]);
    setProducts(storedProducts);
    setCustomers(storedCustomers);
    setExpenses(storedExpenses);
    setSales(storedSales);
    setLastSale(storedSales[0] || lastSale);
  }

  async function handleSaveProduct(product) {
    const saved = await saveProduct(product, settings.lowStockThreshold);
    setProducts((items) => {
      const exists = items.some((item) => item.id === saved.id);
      return exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [...items, saved];
    });
    setSelectedProductId(saved.id);
    setProductDraft(null);
    if (Number(saved.qty || 0) <= lowStockThreshold) {
      setStockNoticeDismissed(false);
      setSaleNotice({
        title: 'Low stock item saved',
        text: `${saved.name || 'This product'} has ${saved.qty} left.`
      });
    }
  }

  async function handleDeleteProduct(id) {
    await removeProduct(id);
    const remaining = products.filter((item) => item.id !== id);
    setProducts(remaining);
    setSelectedProductId(remaining[0]?.id || '');
  }

  async function handleSaveExpense(expense) {
    const saved = await saveExpense({ ...expense, color: expenseColors[expense.label] || expenseColors.Miscellaneous });
    setExpenses((items) => {
      const exists = items.some((item) => item.id === saved.id);
      return exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [...items, saved];
    });
    setExpenseDraft(null);
  }

  async function handleDeleteExpense(id) {
    await removeExpense(id);
    setExpenses((items) => items.filter((item) => item.id !== id));
  }

  async function handleSaveCustomer(customer) {
    const saved = await saveCustomer(customer);
    setCustomers((items) => {
      const exists = items.some((item) => item.phone === saved.phone);
      return exists ? items.map((item) => (item.phone === saved.phone ? saved : item)) : [...items, saved];
    });
    setSelectedCustomerPhone(saved.phone);
    setCustomerDraft(null);
  }

  async function handleDeleteCustomer(phone) {
    await removeCustomer(phone);
    const remaining = customers.filter((item) => item.phone !== phone);
    setCustomers(remaining);
    setSelectedCustomerPhone(remaining[0]?.phone || '');
  }

  async function handleSavePin(pin) {
    const saved = await saveSecuritySettings(pin);
    setSecurity(saved);
  }

  async function handleUpdateSettings(nextSettings) {
    const saved = await saveBusinessSettings(nextSettings);
    setSettings(saved);
    setSettingsDraft(null);
    setStockNoticeDismissed(false);
  }

  async function handleExportData() {
    const data = await exportBusinessData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `luxe-little-treasures-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportData(file) {
    if (!file) return;
    const data = JSON.parse(await file.text());
    await importBusinessData(data);
    const restoredSettings = await getBusinessSettings();
    const restoredSecurity = await getSecuritySettings();
    setSettings(restoredSettings || { ...defaultSettings, setupComplete: false });
    setSecurity(restoredSecurity || null);
    await reloadBusinessData();
  }

  async function handleClearData() {
    const confirmed = window.confirm('Clear all products, customers, sales, and expenses on this device? This cannot be undone unless you have a backup.');
    if (!confirmed) return;
    await clearBusinessData();
    setProducts([]);
    setCustomers([]);
    setExpenses([]);
    setSales([]);
    setLastSale(null);
    setSelectedProductId('');
    setSelectedCustomerPhone('');
  }

  async function saveSale() {
    if (!selectedProduct || !selectedCustomer) return;
    const { updatedProduct, sale } = await recordSale({
      product: selectedProduct,
      quantity: saleQty,
      customerName: selectedCustomer.name,
      phone: selectedCustomer.phone,
      lowStockThreshold: settings.lowStockThreshold
    });
    setProducts((items) => items.map((item) => (item.id === updatedProduct.id ? updatedProduct : item)));
    setSales((items) => [sale, ...items]);
    setLastSale(sale);
    setSaleQty(1);
    setActiveTab('receipt');
    if (Number(updatedProduct.qty || 0) <= lowStockThreshold) {
      setStockNoticeDismissed(false);
      setSaleNotice({
        title: 'Stock is now low',
        text: `${updatedProduct.name} has ${updatedProduct.qty} left.`
      });
    }
    await reloadBusinessData();
  }

  async function completeSetup(nextSettings, pin) {
    const saved = await saveBusinessSettings(nextSettings);
    const savedSecurity = await saveSecuritySettings(pin);
    setSettings(saved);
    setSecurity(savedSecurity);
    setSettingsDraft(null);
  }

  if (!isStandalone) return <InstallGate />;
  if (showSplash) return <SplashScreen />;
  if (!settings?.setupComplete) return <Onboarding settings={settings || defaultSettings} onComplete={completeSetup} />;
  if (!security?.pinHash) return <Onboarding settings={settings || defaultSettings} onComplete={completeSetup} pinOnly />;
  if (!isUnlocked) return <LoginScreen onUnlock={unlock} security={security} pinDraft={pinDraft} setPinDraft={setPinDraft} pinError={pinError} />;

  return (
    <main className="app-shell">
      <div className="phone">
        <Header activeTab={activeTab} />
        {!stockNoticeDismissed && lowStockItems.length > 0 && (
          <LowStockNotice
            items={lowStockItems}
            threshold={lowStockThreshold}
            onClose={() => setStockNoticeDismissed(true)}
            onView={() => {
              setActiveTab('inventory');
              setStockNoticeDismissed(true);
            }}
          />
        )}
        {saleNotice && <ToastNotice notice={saleNotice} onClose={() => setSaleNotice(null)} />}
        <section className="screen-content">
          {activeTab === 'dashboard' && <Dashboard totals={totals} />}
          {activeTab === 'inventory' && (
            <Inventory
              products={products}
              onAdd={() => setProductDraft(emptyProduct(settings))}
              onEdit={setProductDraft}
              onDelete={handleDeleteProduct}
              settings={settings}
            />
          )}
          {activeTab === 'sales' && (
            <SalesForm
              customers={customers}
              products={products}
              saleQty={saleQty}
              setSaleQty={setSaleQty}
              selectedProductId={selectedProductId}
              setSelectedProductId={setSelectedProductId}
              selectedCustomerPhone={selectedCustomerPhone}
              setSelectedCustomerPhone={setSelectedCustomerPhone}
              product={selectedProduct}
              customer={selectedCustomer}
              saleTotal={saleTotal}
              saleProfit={saleProfit}
              onSave={saveSale}
            />
          )}
          {activeTab === 'customers' && (
            <Customers
              customers={customers}
              sales={sales}
              onAdd={() => setCustomerDraft(emptyCustomer())}
              onEdit={setCustomerDraft}
              onDelete={handleDeleteCustomer}
            />
          )}
          {activeTab === 'more' && (
            <Reports
              totals={totals}
              expenses={expenses}
              onAddExpense={() => setExpenseDraft(emptyExpense(settings))}
              onEditExpense={setExpenseDraft}
              onDeleteExpense={handleDeleteExpense}
              settings={settings}
              onEditSettings={() => setSettingsDraft(settings)}
              onExportData={handleExportData}
              onImportData={handleImportData}
              onClearData={handleClearData}
              onSavePin={handleSavePin}
              hasPin={Boolean(security?.pinHash)}
              appVersion={appVersion}
              sales={sales}
              onViewSale={(sale) => {
                setLastSale(sale);
                setActiveTab('receipt');
              }}
            />
          )}
          {activeTab === 'receipt' && <Receipt sale={lastSale} />}
        </section>
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
        {productDraft && (
          <ProductSheet
            product={productDraft}
            onClose={() => setProductDraft(null)}
            onSave={handleSaveProduct}
            settings={settings}
          />
        )}
        {expenseDraft && (
          <ExpenseSheet
            expense={expenseDraft}
            onClose={() => setExpenseDraft(null)}
            onSave={handleSaveExpense}
            settings={settings}
          />
        )}
        {settingsDraft && (
          <SettingsSheet
            settings={settingsDraft}
            onClose={() => setSettingsDraft(null)}
            onSave={handleUpdateSettings}
          />
        )}
        {customerDraft && (
          <CustomerSheet
            customer={customerDraft}
            onClose={() => setCustomerDraft(null)}
            onSave={handleSaveCustomer}
          />
        )}
      </div>
    </main>
  );
}

function emptyProduct(settings = defaultSettings) {
  return {
    name: '',
    category: settings.stockCategories?.[0] || 'Kiddies Wear',
    sizeType: settings.sizeTypes?.[0] || 'Age Sizes',
    size: '',
    qty: 1,
    cost: 0,
    price: 0,
    supplier: ''
  };
}

function emptyExpense(settings = defaultSettings) {
  const label = settings.expenseCategories?.[0] || 'Packaging';
  return { label, amount: '', color: expenseColors[label] || expenseColors.Miscellaneous };
}

function emptyCustomer() {
  return { name: '', phone: '', address: '', balance: 0, notes: '', last: today, orders: 0 };
}

function InstallGate() {
  return (
    <main className="install-page">
      <div className="install-phone glass">
        <img src="/apple-touch-icon.png" className="install-icon" alt="Luxe and Little Treasures icon" />
        <h1>Luxe & Little Treasures</h1>
        <p>Install the private business manager on your iPhone Home Screen, then open it from the app icon.</p>
        <div className="install-steps">
          <div><Share2 size={18} /> Open this link in Safari</div>
          <div><Plus size={18} /> Tap Share, then Add to Home Screen</div>
          <div><Sparkles size={18} /> Launch from the new Home Screen icon</div>
        </div>
        <span className="small-note">For privacy, the business app only opens from the installed Home Screen icon.</span>
      </div>
    </main>
  );
}

function LoginScreen({ onUnlock, security, pinDraft, setPinDraft, pinError }) {
  return (
    <main className="app-shell">
      <div className="phone login-screen">
        <div className="brand-orbit">
          <img src="/brand-logo.png" alt="Luxe and Little Treasures logo" />
        </div>
        <div className="login-card glass">
          <h1>Business Manager</h1>
          <p>Inventory, sales, expenses and customers in one soft little command center.</p>
          {security?.pinHash && (
            <label className="pin-field">
              <span>Enter PIN</span>
              <input
                inputMode="numeric"
                maxLength="6"
                type="password"
                value={pinDraft}
                onChange={(event) => setPinDraft(event.target.value)}
              />
              {pinError && <em>{pinError}</em>}
            </label>
          )}
          <button className="primary-btn" onClick={onUnlock}>Enter App</button>
        </div>
      </div>
    </main>
  );
}

function SplashScreen() {
  return (
    <main className="app-shell">
      <div className="phone splash-screen">
        <div className="spark-ring" />
        <img src="/apple-touch-icon.png" className="splash-mark" alt="" />
        <p>Loading business manager</p>
      </div>
    </main>
  );
}

function Onboarding({ settings, onComplete, pinOnly = false }) {
  const [step, setStep] = useState(pinOnly ? 2 : 0);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [setupError, setSetupError] = useState('');
  const [draft, setDraft] = useState({
    ...defaultSettings,
    ...settings,
    stockCategories: settings.stockCategories?.length ? settings.stockCategories : defaultSettings.stockCategories,
    sizeTypes: settings.sizeTypes?.length ? settings.sizeTypes : defaultSettings.sizeTypes,
    expenseCategories: settings.expenseCategories?.length ? settings.expenseCategories : defaultSettings.expenseCategories
  });

  function addListItem(key, value) {
    const clean = value.trim();
    if (!clean) return;
    setDraft((current) => ({ ...current, [key]: [...new Set([...current[key], clean])] }));
  }

  function removeListItem(key, value) {
    setDraft((current) => ({ ...current, [key]: current[key].filter((item) => item !== value) }));
  }

  function nextStep() {
    setSetupError('');
    if (step < 2) {
      setStep((current) => current + 1);
      return;
    }

    if (pin.length < 4 || pin.length > 6) {
      setSetupError('Use a 4-6 digit PIN.');
      return;
    }

    if (pin !== confirmPin) {
      setSetupError('PINs do not match.');
      return;
    }

    onComplete(draft, pin);
  }

  return (
    <main className="app-shell">
      <div className="phone setup-screen">
        <div className="setup-hero">
          <img src="/apple-touch-icon.png" alt="" />
          <span>{pinOnly ? 'Security setup' : `Step ${step + 1} of 3`}</span>
          <h1>{step === 2 ? 'Protect the business records.' : 'Set up your business workspace.'}</h1>
          <p>{step === 2 ? 'Create a PIN before the dashboard opens.' : 'These lists will power Inventory, Sales, Expenses, and Reports.'}</p>
        </div>
        <div className="setup-panel glass">
          {step === 0 && (
            <CategoryEditor
              title="Stock Categories"
              items={draft.stockCategories}
              placeholder="Add category"
              onAdd={(value) => addListItem('stockCategories', value)}
              onRemove={(value) => removeListItem('stockCategories', value)}
            />
          )}
          {step === 1 && (
            <>
              <CategoryEditor
                title="Size Types"
                items={draft.sizeTypes}
                placeholder="Add size type"
                onAdd={(value) => addListItem('sizeTypes', value)}
                onRemove={(value) => removeListItem('sizeTypes', value)}
              />
              <CategoryEditor
                title="Expense Categories"
                items={draft.expenseCategories}
                placeholder="Add expense category"
                onAdd={(value) => addListItem('expenseCategories', value)}
                onRemove={(value) => removeListItem('expenseCategories', value)}
              />
              <label className="sheet-field setup-threshold">
                <span>Low Stock Alert Threshold</span>
                <input
                  type="number"
                  value={draft.lowStockThreshold}
                  onChange={(event) => setDraft((current) => ({ ...current, lowStockThreshold: event.target.value }))}
                />
              </label>
            </>
          )}
          {step === 2 && (
            <div className="pin-setup-card">
              <label className="sheet-field">
                <span>Create PIN</span>
                <input inputMode="numeric" type="password" maxLength="6" value={pin} onChange={(event) => setPin(event.target.value)} />
              </label>
              <label className="sheet-field">
                <span>Confirm PIN</span>
                <input inputMode="numeric" type="password" maxLength="6" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value)} />
              </label>
              <p>Use this PIN anytime the app is reopened after being idle.</p>
            </div>
          )}
          {setupError && <p className="setup-error">{setupError}</p>}
          <div className="wizard-actions">
            {!pinOnly && step > 0 && <button className="secondary-btn" onClick={() => setStep((current) => current - 1)}>Back</button>}
            <button className="primary-btn" onClick={nextStep}>{step === 2 ? 'Finish Setup' : 'Continue'}</button>
          </div>
        </div>
      </div>
    </main>
  );
}

function CategoryEditor({ title, items, placeholder, onAdd, onRemove }) {
  const [value, setValue] = useState('');

  function submit() {
    onAdd(value);
    setValue('');
  }

  return (
    <section className="category-editor glass">
      <h2>{title}</h2>
      <div className="chips">
        {items.map((item) => (
          <button key={item} className="chip" onClick={() => onRemove(item)}>
            {item}
            <X size={13} />
          </button>
        ))}
      </div>
      <div className="add-line">
        <input value={value} placeholder={placeholder} onChange={(event) => setValue(event.target.value)} />
        <button onClick={submit}><Plus size={17} /></button>
      </div>
    </section>
  );
}

function SettingsEditor({ draft, setDraft }) {
  function addListItem(key, value) {
    const clean = value.trim();
    if (!clean) return;
    setDraft((current) => ({ ...current, [key]: [...new Set([...current[key], clean])] }));
  }

  function removeListItem(key, value) {
    setDraft((current) => ({ ...current, [key]: current[key].filter((item) => item !== value) }));
  }

  return (
    <>
      <CategoryEditor
        title="Stock Categories"
        items={draft.stockCategories}
        placeholder="Add category"
        onAdd={(value) => addListItem('stockCategories', value)}
        onRemove={(value) => removeListItem('stockCategories', value)}
      />
      <CategoryEditor
        title="Size Types"
        items={draft.sizeTypes}
        placeholder="Add size type"
        onAdd={(value) => addListItem('sizeTypes', value)}
        onRemove={(value) => removeListItem('sizeTypes', value)}
      />
      <CategoryEditor
        title="Expense Categories"
        items={draft.expenseCategories}
        placeholder="Add expense category"
        onAdd={(value) => addListItem('expenseCategories', value)}
        onRemove={(value) => removeListItem('expenseCategories', value)}
      />
      <label className="sheet-field setup-threshold">
        <span>Low Stock Alert Threshold</span>
        <input
          type="number"
          value={draft.lowStockThreshold}
          onChange={(event) => setDraft((current) => ({ ...current, lowStockThreshold: event.target.value }))}
        />
      </label>
    </>
  );
}

function Header({ activeTab }) {
  const titles = {
    dashboard: 'Dashboard',
    inventory: 'Inventory',
    sales: 'Record Sale',
    customers: 'Customers',
    more: 'Expenses & Reports',
    receipt: 'Receipt'
  };

  return (
    <header className="topbar">
      <button className="icon-btn">{activeTab === 'dashboard' ? <Menu size={20} /> : <ChevronLeft size={20} />}</button>
      <div>
        <span>Luxe & Little Treasures</span>
        <strong>{titles[activeTab]}</strong>
      </div>
      <button className="icon-btn">{activeTab === 'dashboard' ? <Bell size={20} /> : <Settings size={20} />}</button>
    </header>
  );
}

function Dashboard({ totals }) {
  return (
    <div className="stack">
      <div className="date-pill"><CalendarDays size={16} /> {today}</div>
      <div className="metric-grid">
        <Metric title="Today's Sales" value={money.format(totals.todaySales)} note="Recorded locally" icon={<WalletCards />} tone="pink" />
        <Metric title="Today's Expenses" value={money.format(totals.todayExpenses)} note="This month" icon={<ClipboardList />} tone="lemon" />
        <Metric title="Monthly Revenue" value={money.format(totals.monthlyRevenue)} note="Saved sales" icon={<BarChart3 />} tone="lavender" />
        <Metric title="Net Profit" value={money.format(totals.netProfit)} note="Revenue less expenses" icon={<Sparkles />} tone="purple" />
      </div>
      <div className="alert-row glass">
        <AlertTriangle size={20} />
        <div>
          <strong>{totals.low} Low Stock Alerts</strong>
          <span>Review items before weekend sales</span>
        </div>
      </div>
      <div className="mini-grid">
        <Mini title="Pending Orders" value={totals.pendingOrders} sub="To be delivered" />
        <Mini title="Remaining Stock" value={totals.stock} sub="Across products" />
        <Mini title="Best Seller" value={totals.bestName} sub="From saved sales" />
      </div>
    </div>
  );
}

function LowStockNotice({ items, threshold, onClose, onView }) {
  const preview = items.slice(0, 2).map((item) => `${item.name} (${item.qty})`).join(', ');

  return (
    <aside className="stock-notice glass" role="status" aria-live="polite">
      <AlertTriangle size={19} />
      <div>
        <strong>{items.length} low stock {items.length === 1 ? 'item' : 'items'}</strong>
        <span>{preview || `Threshold is ${threshold}`} {items.length > 2 ? `+${items.length - 2} more` : ''}</span>
      </div>
      <button onClick={onView}>View</button>
      <button className="notice-close" onClick={onClose} aria-label="Dismiss low stock notice"><X size={15} /></button>
    </aside>
  );
}

function ToastNotice({ notice, onClose }) {
  return (
    <aside className="toast-notice glass" role="status" aria-live="polite">
      <Bell size={18} />
      <div>
        <strong>{notice.title}</strong>
        <span>{notice.text}</span>
      </div>
      <button onClick={onClose} aria-label="Dismiss notification"><X size={15} /></button>
    </aside>
  );
}

function Metric({ title, value, note, icon, tone }) {
  return (
    <article className={`metric-card glass ${tone}`}>
      <div className="metric-head">
        <span>{title}</span>
        {React.cloneElement(icon, { size: 18 })}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Mini({ title, value, sub }) {
  return (
    <article className="mini-card glass">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </article>
  );
}

function Inventory({ products, onAdd, onEdit, onDelete }) {
  return (
    <div className="stack">
      <div className="search glass"><Search size={17} /> Search products...</div>
      <div className="section-title">
        <h2>Stock List</h2>
        <button className="small-action" onClick={onAdd}><PackagePlus size={16} /> Add</button>
      </div>
      <div className="list-panel glass">
        {products.length === 0 && <EmptyState title="No products yet" text="Add your first stock item to begin tracking inventory." />}
        {products.map((item) => (
          <div className="product-row" key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <span>{item.category} - Size {item.size} - {money.format(item.price)}</span>
            </div>
            <div className="row-actions">
              <strong>{item.qty}</strong>
              <em className={item.status === 'Low Stock' ? 'warning' : 'ok'}>{item.status}</em>
              <button onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}><Edit3 size={14} /></button>
              <button onClick={() => onDelete(item.id)} aria-label={`Delete ${item.name}`}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SalesForm({
  customers,
  products,
  saleQty,
  setSaleQty,
  selectedProductId,
  setSelectedProductId,
  selectedCustomerPhone,
  setSelectedCustomerPhone,
  product,
  saleTotal,
  saleProfit,
  onSave
}) {
  return (
    <div className="stack form-stack">
      <SelectField label="Customer" value={selectedCustomerPhone} onChange={setSelectedCustomerPhone} icon={<UserRound />}>
        {customers.length === 0 && <option value="">Add customer first</option>}
        {customers.map((customer) => <option key={customer.phone} value={customer.phone}>{customer.name}</option>)}
      </SelectField>
      <Field label="Phone Number" value={selectedCustomerPhone} icon={<UsersRound />} />
      <SelectField label="Product" value={selectedProductId} onChange={setSelectedProductId} icon={<ShoppingBag />}>
        {products.length === 0 && <option value="">Add product first</option>}
        {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </SelectField>
      <Field label="Product Size" value={product?.size || '-'} icon={<Archive />} />
      <div className="field glass">
        <span>Quantity</span>
        <div className="stepper">
          <button onClick={() => setSaleQty(Math.max(1, saleQty - 1))}><Minus size={16} /></button>
          <strong>{saleQty}</strong>
          <button onClick={() => setSaleQty(Math.min(product?.qty || 1, saleQty + 1))}><Plus size={16} /></button>
        </div>
      </div>
      <div className="total-card glass">
        <div><span>Total Amount</span><strong>{money.format(saleTotal)}</strong></div>
        <div><span>Profit Est.</span><strong>{money.format(saleProfit)}</strong></div>
      </div>
      <Field label="Payment Status" value="Paid" icon={<Check />} good />
      <Field label="Delivery Status" value="To be Delivered" icon={<ClipboardList />} />
      <Field label="Order Date" value={today} icon={<CalendarDays />} />
      <button className="primary-btn" onClick={onSave} disabled={!product || product.qty <= 0}>Save Sale</button>
    </div>
  );
}

function Field({ label, value, icon, good }) {
  return (
    <div className="field glass">
      {React.cloneElement(icon, { size: 17 })}
      <span>{label}</span>
      <strong className={good ? 'good' : ''}>{value}</strong>
    </div>
  );
}

function SelectField({ label, value, onChange, icon, children }) {
  return (
    <label className="field input-field glass">
      {React.cloneElement(icon, { size: 17 })}
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </label>
  );
}

function Customers({ customers, sales, onAdd, onEdit, onDelete }) {
  return (
    <div className="stack">
      <div className="search glass"><Search size={17} /> Search customers...</div>
      <div className="section-title">
        <h2>Customer Records</h2>
        <button className="small-action" onClick={onAdd}><Plus size={16} /> Add</button>
      </div>
      <div className="customer-list">
        {customers.length === 0 && <EmptyState title="No customers yet" text="Add customers here before recording sales." />}
        {customers.map((customer) => {
          const orderCount = sales.filter((sale) => sale.phone === customer.phone).length || customer.orders;
          return (
            <article className="customer-card glass" key={customer.phone}>
              <div className="avatar">{customer.name.split(' ').map((part) => part[0]).join('')}</div>
              <div>
                <strong>{customer.name}</strong>
                <span>{customer.phone}</span>
                <small>{customer.address || 'No address'} - {orderCount} {orderCount === 1 ? 'order' : 'orders'}</small>
              </div>
              <div className="customer-actions">
                <em className={customer.balance ? 'warning' : 'ok'}>{customer.balance ? money.format(customer.balance) : 'NO'}</em>
                <button onClick={() => onEdit(customer)}><Edit3 size={14} /></button>
                <button onClick={() => onDelete(customer.phone)}><Trash2 size={14} /></button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Reports({
  totals,
  expenses,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
  settings,
  onEditSettings,
  onExportData,
  onImportData,
  onClearData,
  onSavePin,
  hasPin,
  appVersion,
  sales,
  onViewSale
}) {
  const [pin, setPin] = useState('');
  const [view, setView] = useState('expenses');

  return (
    <div className="stack">
      <div className="segmented glass">
        <button className={view === 'expenses' ? 'selected' : ''} onClick={() => setView('expenses')}>Expenses</button>
        <button className={view === 'reports' ? 'selected' : ''} onClick={() => setView('reports')}>Reports</button>
      </div>
      <button className="settings-card glass" onClick={onEditSettings}>
        <Settings size={20} />
        <div>
          <strong>Business Settings</strong>
          <span>{settings.stockCategories.length} stock categories - {settings.expenseCategories.length} expense categories</span>
        </div>
      </button>
      <div className="backup-card glass">
        <div>
          <strong>Backup & Security</strong>
          <span>Export data and protect the app with a PIN</span>
        </div>
        <button onClick={onExportData}>Export</button>
        <label className="import-btn">
          Import Backup
          <input type="file" accept="application/json" onChange={(event) => onImportData(event.target.files?.[0])} />
        </label>
        <button className="danger-btn" onClick={onClearData}>Clear Data</button>
        <div className="pin-row">
          <input value={pin} inputMode="numeric" maxLength="6" placeholder={hasPin ? 'Enter new PIN' : 'Create 4-6 digit PIN'} onChange={(event) => setPin(event.target.value)} />
          <button onClick={() => pin.length >= 4 && onSavePin(pin)}>{hasPin ? 'Update' : 'Save'}</button>
        </div>
        <span className="app-version">Version {appVersion} - Phone database</span>
      </div>
      {view === 'expenses' ? (
        <>
          <div className="section-title">
            <h2>Expense List</h2>
            <button className="small-action" onClick={onAddExpense}><Plus size={16} /> Add</button>
          </div>
          <div className="report-card glass">
            <h2>Expenses by Category</h2>
            {expenses.map((item) => (
              <div className="expense-row" key={item.id}>
                <span><i style={{ background: item.color }} /> {item.label}</span>
                <strong>{money.format(item.amount)}</strong>
                <button onClick={() => onEditExpense(item)}><Edit3 size={14} /></button>
                <button onClick={() => onDeleteExpense(item.id)}><Trash2 size={14} /></button>
              </div>
            ))}
            {expenses.length === 0 && <EmptyState title="No expenses yet" text="Add expenses to track business outflow." />}
          </div>
        </>
      ) : (
        <>
          <div className="metric-grid">
            <Metric title="Revenue" value={money.format(totals.monthlyRevenue)} note="Saved sales" icon={<BarChart3 />} tone="pink" />
            <Metric title="Expenses" value={money.format(totals.expenses)} note="Tracked locally" icon={<WalletCards />} tone="lemon" />
            <Metric title="Net Profit" value={money.format(totals.netProfit)} note="After expenses" icon={<Sparkles />} tone="purple" />
            <Metric title="Stock Left" value={totals.stock} note="Across products" icon={<Archive />} tone="lavender" />
          </div>
          <div className="report-card glass">
            <h2>Sales History</h2>
            {sales.length === 0 && <p className="empty-note">No saved sales yet.</p>}
            {sales.slice(0, 8).map((sale) => (
              <button className="sale-history-row" key={sale.id} onClick={() => onViewSale(sale)}>
                <span>{sale.productName}</span>
                <strong>{money.format(sale.total)}</strong>
                <small>{sale.customerName}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function Receipt({ sale }) {
  const receipt = sale || {
    id: 'preview',
    customerName: 'Amaka Chinedu',
    productName: 'Princess Tutu Dress',
    productSize: '3-4Y',
    total: 12000,
    profit: 5500,
    quantity: 1
  };

  function shareReceipt() {
    const text = encodeURIComponent(`Luxe & Little Treasures Receipt\nItem: ${receipt.productName}\nTotal: ${money.format(receipt.total)}\nBalance: 0`);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  function savePdf() {
    window.print();
  }

  return (
    <div className="receipt-wrap">
      <div className="receipt-paper">
        <img src="/brand-logo.png" alt="Luxe and Little Treasures logo" />
        <span>Receipt No. LLT-2026-{String(receipt.id).padStart(4, '0')}</span>
        <div className="receipt-lines">
          <p><b>Customer</b><em>{receipt.customerName}</em></p>
          <p><b>Item</b><em>{receipt.productName}</em></p>
          <p><b>Size</b><em>{receipt.productSize}</em></p>
          <p><b>Qty</b><em>{receipt.quantity}</em></p>
          <p><b>Total</b><em>{money.format(receipt.total)}</em></p>
          <p><b>Profit</b><em>{money.format(receipt.profit)}</em></p>
          <p><b>Balance</b><em className="ok">0</em></p>
        </div>
      </div>
      <button className="whatsapp-btn" onClick={shareReceipt}><Share2 size={18} /> Share via WhatsApp</button>
      <button className="pdf-btn" onClick={savePdf}><Download size={18} /> Save as PDF</button>
    </div>
  );
}

function ProductSheet({ product, onClose, onSave, settings }) {
  const [draft, setDraft] = useState(product);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <Sheet title={draft.id ? 'Edit Product' : 'Add Product'} onClose={onClose}>
      <TextInput label="Product Name" value={draft.name} onChange={(value) => update('name', value)} />
      <SheetSelect label="Category" value={draft.category} onChange={(value) => update('category', value)} options={settings.stockCategories} />
      <SheetSelect label="Size Type" value={draft.sizeType} onChange={(value) => update('sizeType', value)} options={settings.sizeTypes} />
      <TextInput label="Size" value={draft.size} onChange={(value) => update('size', value)} />
      <TextInput label="Quantity" type="number" value={draft.qty} onChange={(value) => update('qty', value)} />
      <TextInput label="Cost Price" type="number" value={draft.cost} onChange={(value) => update('cost', value)} />
      <TextInput label="Selling Price" type="number" value={draft.price} onChange={(value) => update('price', value)} />
      <TextInput label="Supplier" value={draft.supplier || ''} onChange={(value) => update('supplier', value)} />
      <button className="primary-btn" onClick={() => onSave(draft)}>Save Product</button>
    </Sheet>
  );
}

function ExpenseSheet({ expense, onClose, onSave, settings }) {
  const [draft, setDraft] = useState(expense);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <Sheet title={draft.id ? 'Edit Expense' : 'Add Expense'} onClose={onClose}>
      <SheetSelect label="Category" value={draft.label} onChange={(value) => update('label', value)} options={settings.expenseCategories} />
      <TextInput label="Amount" type="number" value={draft.amount} onChange={(value) => update('amount', value)} />
      <button className="primary-btn" onClick={() => onSave(draft)}>Save Expense</button>
    </Sheet>
  );
}

function CustomerSheet({ customer, onClose, onSave }) {
  const [draft, setDraft] = useState(customer);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <Sheet title={draft.phone ? 'Edit Customer' : 'Add Customer'} onClose={onClose}>
      <TextInput label="Customer Name" value={draft.name} onChange={(value) => update('name', value)} />
      <TextInput label="Phone Number" value={draft.phone} onChange={(value) => update('phone', value)} />
      <TextInput label="Address" value={draft.address || ''} onChange={(value) => update('address', value)} />
      <TextInput label="Outstanding Balance" type="number" value={draft.balance || 0} onChange={(value) => update('balance', value)} />
      <TextInput label="Notes" value={draft.notes || ''} onChange={(value) => update('notes', value)} />
      <button className="primary-btn" onClick={() => onSave(draft)} disabled={!draft.name || !draft.phone}>Save Customer</button>
    </Sheet>
  );
}

function SettingsSheet({ settings, onClose, onSave }) {
  const [draft, setDraft] = useState(settings);

  return (
    <Sheet title="Business Settings" onClose={onClose}>
      <SettingsEditor draft={draft} setDraft={setDraft} />
      <button className="primary-btn" onClick={() => onSave(draft)}>Save Settings</button>
    </Sheet>
  );
}

function Sheet({ title, children, onClose }) {
  return (
    <div className="sheet-backdrop">
      <div className="sheet glass">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, type = 'text' }) {
  return (
    <label className="sheet-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SheetSelect({ label, value, onChange, options }) {
  return (
    <label className="sheet-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TabBar({ activeTab, setActiveTab }) {
  const tabs = [
    ['dashboard', Home, 'Dashboard'],
    ['inventory', Archive, 'Inventory'],
    ['sales', ShoppingBag, 'Sales'],
    ['customers', UsersRound, 'Customers'],
    ['more', Menu, 'More']
  ];

  return (
    <nav className="tabbar glass">
      {tabs.map(([key, Icon, label]) => (
        <button key={key} className={activeTab === key || (activeTab === 'receipt' && key === 'sales') ? 'active' : ''} onClick={() => setActiveTab(key)}>
          <Icon size={19} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

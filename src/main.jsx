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
  deleteSale,
  exportBusinessData,
  getBusinessSettings,
  getSecuritySettings,
  importBusinessData,
  markReceiptShared,
  recordSale,
  removeCustomer,
  removeExpense,
  removeProduct,
  saveBusinessSettings,
  saveCustomer,
  saveExpense,
  saveProduct,
  saveSecuritySettings,
  updateSaleDetails,
  updateSaleStatus,
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

const appVersion = '1.1.1';
const businessContact = {
  phone: '09076303280',
  tiktok: '@luxeandlittle.treasures',
  instagram: '@Luxeandlittle_treasures'
};

function formatReceiptDate(value) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(value ? new Date(value) : new Date());
}

function pdfMoney(value) {
  return `NGN ${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(Number(value || 0))}`;
}

function toMoneyNumber(value) {
  return Number(value || 0);
}

function orderStatus(sale) {
  return sale.status || 'sold';
}

function orderItems(sale) {
  if (Array.isArray(sale.items) && sale.items.length) return sale.items;
  return [{
    productId: sale.productId,
    productName: sale.productName,
    productSize: sale.productSize,
    quantity: Number(sale.quantity || 1),
    unitPrice: Number(sale.unitPrice || sale.total || 0),
    costPrice: Math.max(0, Number(sale.total || 0) - Number(sale.profit || 0))
  }];
}

function isToday(value) {
  const date = value ? new Date(value) : new Date();
  const now = new Date();
  return date.toDateString() === now.toDateString();
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
  const soldSales = sales.filter((sale) => orderStatus(sale) === 'sold');
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

  const sold = soldSales.reduce(
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
  const [orderLines, setOrderLines] = useState([]);
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
  const saleTotal = orderLines.reduce((sum, line) => {
    const product = products.find((item) => item.id === Number(line.productId));
    return sum + Number(product?.price || 0) * Number(line.quantity || 0);
  }, 0);
  const saleProfit = orderLines.reduce((sum, line) => {
    const product = products.find((item) => item.id === Number(line.productId));
    return sum + (Number(product?.price || 0) - Number(product?.cost || 0)) * Number(line.quantity || 0);
  }, 0);
  const lowStockThreshold = Number(settings?.lowStockThreshold || defaultSettings.lowStockThreshold);
  const lowStockItems = useMemo(
    () => products.filter((item) => Number(item.qty || 0) <= lowStockThreshold),
    [products, lowStockThreshold]
  );
  const profitView = useMemo(() => buildProfitView(products, sales), [products, sales]);

  useEffect(() => {
    if (!products.length || orderLines.length) return;
    const product = products[0];
    setOrderLines([{ id: Date.now(), productId: product.id, productSize: product.size || '', quantity: 1 }]);
  }, [products, orderLines.length]);

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
    const soldSales = sales.filter((sale) => orderStatus(sale) === 'sold');
    const pendingSales = sales.filter((sale) => orderStatus(sale) === 'pending');
    const todaysOrders = sales.filter((sale) => isToday(sale.createdAt));
    const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const stock = products.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const salesTotal = soldSales.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const profitTotal = soldSales.reduce((sum, item) => sum + Number(item.profit || 0), 0);
    const bestProduct = soldSales.length
      ? soldSales.reduce((acc, sale) => {
          orderItems(sale).forEach((item) => {
            acc[item.productName] = (acc[item.productName] || 0) + Number(item.quantity || 0);
          });
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
      pendingOrders: pendingSales.length,
      todayOrders: todaysOrders.length,
      todayPending: todaysOrders.filter((sale) => orderStatus(sale) === 'pending').length,
      todaySold: todaysOrders.filter((sale) => orderStatus(sale) === 'sold').length,
      todayCancelled: todaysOrders.filter((sale) => orderStatus(sale) === 'cancelled').length
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
    if (!selectedCustomer || !orderLines.length) return;
    const items = orderLines
      .map((line) => {
        const product = products.find((item) => item.id === Number(line.productId));
        if (!product) return null;
        return {
          productId: product.id,
          productName: product.name,
          productSize: line.productSize || product.size,
          quantity: Number(line.quantity || 1),
          unitPrice: Number(product.price || 0),
          costPrice: Number(product.cost || 0)
        };
      })
      .filter(Boolean);
    if (!items.length) return;
    const { updatedProducts, sale } = await recordSale({
      items,
      customerName: selectedCustomer.name,
      phone: selectedCustomer.phone,
      lowStockThreshold: settings.lowStockThreshold
    });
    setProducts((current) => current.map((item) => updatedProducts.find((product) => product.id === item.id) || item));
    setSales((items) => [sale, ...items]);
    setLastSale(sale);
    setOrderLines(products[0] ? [{ id: Date.now(), productId: products[0].id, productSize: products[0].size || '', quantity: 1 }] : []);
    setActiveTab('receipt');
    const lowProduct = updatedProducts.find((product) => Number(product.qty || 0) <= lowStockThreshold);
    if (lowProduct) {
      setStockNoticeDismissed(false);
      setSaleNotice({
        title: 'Stock reserved',
        text: `${lowProduct.name} has ${lowProduct.qty} left.`
      });
    }
    await reloadBusinessData();
  }

  async function changeOrderStatus(sale, status) {
    const { sale: updatedSale } = await updateSaleStatus(sale.id, status, settings.lowStockThreshold);
    await reloadBusinessData();
    setLastSale((current) => (current?.id === updatedSale.id ? updatedSale : current));
  }

  async function removeOrder(sale) {
    const confirmed = window.confirm('Delete this order and restore its reserved stock if needed?');
    if (!confirmed) return;
    await deleteSale(sale.id, settings.lowStockThreshold);
    await reloadBusinessData();
    setLastSale((current) => (current?.id === sale.id ? null : current));
  }

  async function editOrder(sale) {
    const customerName = window.prompt('Customer name', sale.customerName || '');
    if (customerName === null) return;
    const phone = window.prompt('Phone number', sale.phone || '');
    if (phone === null) return;
    const updatedSale = await updateSaleDetails(sale.id, { customerName, phone });
    if (!updatedSale) return;
    setSales((items) => items.map((item) => (item.id === updatedSale.id ? updatedSale : item)));
    setLastSale((current) => (current?.id === updatedSale.id ? updatedSale : current));
  }

  async function handleReceiptShared(sale) {
    const updatedSale = await markReceiptShared(sale.id);
    if (!updatedSale) return;
    setSales((items) => items.map((item) => (item.id === updatedSale.id ? updatedSale : item)));
    setLastSale(updatedSale);
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
        <Header
          activeTab={activeTab}
          lowStockCount={lowStockItems.length}
          onMenu={() => setActiveTab('more')}
          onBack={() => setActiveTab(activeTab === 'receipt' ? 'sales' : 'dashboard')}
          onBell={() => {
            if (lowStockItems.length > 0) {
              setStockNoticeDismissed(false);
              return;
            }
            setSaleNotice({
              title: 'No low stock alerts',
              text: `All stock is above ${lowStockThreshold}.`
            });
          }}
          onSettings={() => setSettingsDraft(settings)}
        />
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
          {activeTab === 'dashboard' && <Dashboard totals={totals} stockValue={profitView.current} />}
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
              orderLines={orderLines}
              setOrderLines={setOrderLines}
              selectedCustomerPhone={selectedCustomerPhone}
              setSelectedCustomerPhone={setSelectedCustomerPhone}
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
              profitView={profitView}
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
              onChangeOrderStatus={changeOrderStatus}
              onDeleteOrder={removeOrder}
              onEditOrder={editOrder}
              onViewSale={(sale) => {
                setLastSale(sale);
                setActiveTab('receipt');
              }}
            />
          )}
          {activeTab === 'receipt' && <Receipt sale={lastSale} onReceiptShared={handleReceiptShared} />}
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

function Header({ activeTab, lowStockCount, onMenu, onBack, onBell, onSettings }) {
  const titles = {
    dashboard: 'Dashboard',
    inventory: 'Inventory',
    sales: 'Record Sale',
    customers: 'Customers',
    more: 'Expenses & Reports',
    receipt: 'Receipt'
  };
  const isDashboard = activeTab === 'dashboard';

  return (
    <header className="topbar">
      <button className="icon-btn" onClick={isDashboard ? onMenu : onBack} aria-label={isDashboard ? 'Open more menu' : 'Go back'}>
        {isDashboard ? <Menu size={20} /> : <ChevronLeft size={20} />}
      </button>
      <div>
        <span>Luxe & Little Treasures</span>
        <strong>{titles[activeTab]}</strong>
      </div>
      <button className="icon-btn" onClick={isDashboard ? onBell : onSettings} aria-label={isDashboard ? 'Show notifications' : 'Open settings'}>
        {isDashboard ? (
          <>
            <Bell size={20} />
            {lowStockCount > 0 && <i>{lowStockCount}</i>}
          </>
        ) : (
          <Settings size={20} />
        )}
      </button>
    </header>
  );
}

function Dashboard({ totals, stockValue }) {
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
      <StockValueGlance stockValue={stockValue} />
      <TodaysOrdersGlance totals={totals} />
      <div className="mini-grid">
        <Mini title="Pending Orders" value={totals.pendingOrders} sub="To be delivered" />
        <Mini title="Remaining Stock" value={totals.stock} sub="Across products" />
        <Mini title="Best Seller" value={totals.bestName} sub="From saved sales" />
      </div>
    </div>
  );
}

function TodaysOrdersGlance({ totals }) {
  return (
    <section className="today-glance glass">
      <div className="today-glance-head">
        <div>
          <span>Today's Orders</span>
          <strong>{totals.todayOrders}</strong>
        </div>
        <ShoppingBag size={21} />
      </div>
      <div className="today-glance-grid">
        <div><span>Pending</span><strong>{totals.todayPending}</strong></div>
        <div><span>Sold</span><strong>{totals.todaySold}</strong></div>
        <div><span>Cancelled</span><strong>{totals.todayCancelled}</strong></div>
      </div>
    </section>
  );
}

function StockValueGlance({ stockValue }) {
  const maxValue = Math.max(stockValue.totalSelling, stockValue.totalCost, Math.abs(stockValue.expectedProfit), 1);
  const bars = [
    ['Cost Value', stockValue.totalCost, 'cost'],
    ['Selling Value', stockValue.totalSelling, 'selling'],
    ['Expected Profit', stockValue.expectedProfit, 'profit']
  ];

  return (
    <section className="stock-glance glass">
      <div className="stock-glance-head">
        <div>
          <span>Stock Value at a Glance</span>
          <strong>{money.format(stockValue.expectedProfit)}</strong>
        </div>
        <BarChart3 size={20} />
      </div>
      <div className="stock-bars">
        {bars.map(([label, value, tone]) => (
          <div className="stock-bar-row" key={label}>
            <span>{label}</span>
            <div className="stock-bar-track">
              <i className={tone} style={{ width: `${Math.max(6, Math.min(100, (Math.abs(value) / maxValue) * 100))}%` }} />
            </div>
            <strong>{money.format(value)}</strong>
          </div>
        ))}
      </div>
      <div className="stock-glance-mini">
        <div><span>Cost</span><strong>{money.format(stockValue.totalCost)}</strong></div>
        <div><span>Selling</span><strong>{money.format(stockValue.totalSelling)}</strong></div>
        <div><span>Profit</span><strong>{money.format(stockValue.expectedProfit)}</strong></div>
      </div>
    </section>
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
  orderLines,
  setOrderLines,
  selectedCustomerPhone,
  setSelectedCustomerPhone,
  saleTotal,
  saleProfit,
  onSave
}) {
  function updateLine(id, field, value) {
    setOrderLines((lines) => lines.map((line) => {
      if (line.id !== id) return line;
      const next = { ...line, [field]: value };
      if (field === 'productId') {
        const product = products.find((item) => item.id === Number(value));
        next.productSize = product?.size || '';
        next.quantity = 1;
      }
      return next;
    }));
  }

  function addLine() {
    const product = products[0];
    if (!product) return;
    setOrderLines((lines) => [...lines, {
      id: Date.now(),
      productId: product.id,
      productSize: product.size || '',
      quantity: 1
    }]);
  }

  function removeLine(id) {
    setOrderLines((lines) => (lines.length > 1 ? lines.filter((line) => line.id !== id) : lines));
  }

  return (
    <div className="stack form-stack">
      <SelectField label="Customer" value={selectedCustomerPhone} onChange={setSelectedCustomerPhone} icon={<UserRound />}>
        {customers.length === 0 && <option value="">Add customer first</option>}
        {customers.map((customer) => <option key={customer.phone} value={customer.phone}>{customer.name}</option>)}
      </SelectField>
      <Field label="Phone Number" value={selectedCustomerPhone} icon={<UsersRound />} />

      <div className="section-title">
        <h2>Order Items</h2>
        <button className="small-action" onClick={addLine}><Plus size={16} /> Add</button>
      </div>
      <div className="order-lines">
        {orderLines.map((line, index) => {
          const product = products.find((item) => item.id === Number(line.productId));
          const maxQty = Math.max(1, Number(product?.qty || 1));

          return (
            <div className="order-line-card glass" key={line.id}>
              <div className="order-line-head">
                <strong>Item {index + 1}</strong>
                {orderLines.length > 1 && <button onClick={() => removeLine(line.id)}><Trash2 size={14} /></button>}
              </div>
              <SelectField label="Product" value={line.productId} onChange={(value) => updateLine(line.id, 'productId', value)} icon={<ShoppingBag />}>
                {products.length === 0 && <option value="">Add product first</option>}
                {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </SelectField>
              <EditableField label="Product Size" value={line.productSize} onChange={(value) => updateLine(line.id, 'productSize', value)} icon={<Archive />} placeholder="Enter size" />
              <div className="field glass">
                <span>Quantity</span>
                <div className="stepper">
                  <button onClick={() => updateLine(line.id, 'quantity', Math.max(1, Number(line.quantity || 1) - 1))}><Minus size={16} /></button>
                  <strong>{line.quantity}</strong>
                  <button onClick={() => updateLine(line.id, 'quantity', Math.min(maxQty, Number(line.quantity || 1) + 1))}><Plus size={16} /></button>
                </div>
              </div>
            </div>
          );
        })}
        {products.length === 0 && <EmptyState title="No products yet" text="Add products before recording an order." />}
      </div>

      <div className="field glass">
        <Check size={17} />
        <span>Order Status</span>
        <strong>Pending</strong>
      </div>
      <div className="field glass">
        <Archive size={17} />
        <span>Stock Action</span>
        <strong>Reserved</strong>
      </div>
      <div className="total-card glass">
        <div><span>Order Total</span><strong>{money.format(saleTotal)}</strong></div>
        <div><span>Profit Est.</span><strong>{money.format(saleProfit)}</strong></div>
      </div>
      <Field label="Order Date" value={today} icon={<CalendarDays />} />
      <button className="primary-btn" onClick={onSave} disabled={!products.length || !selectedCustomerPhone || !orderLines.length}>Save Pending Order</button>
    </div>
  );
}

function EditableField({ label, value, onChange, icon, placeholder }) {
  return (
    <label className="field input-field glass">
      {React.cloneElement(icon, { size: 17 })}
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
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
  profitView,
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
  onChangeOrderStatus,
  onDeleteOrder,
  onViewSale
}) {
  const [pin, setPin] = useState('');
  const [view, setView] = useState('expenses');

  return (
    <div className="stack">
      <div className="segmented glass four-way">
        <button className={view === 'expenses' ? 'selected' : ''} onClick={() => setView('expenses')}>Expenses</button>
        <button className={view === 'reports' ? 'selected' : ''} onClick={() => setView('reports')}>Reports</button>
        <button className={view === 'profit' ? 'selected' : ''} onClick={() => setView('profit')}>Profit View</button>
        <button className={view === 'today' ? 'selected' : ''} onClick={() => setView('today')}>Today</button>
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
      ) : view === 'reports' ? (
        <>
          <div className="metric-grid">
            <Metric title="Revenue" value={money.format(totals.monthlyRevenue)} note="Saved sales" icon={<BarChart3 />} tone="pink" />
            <Metric title="Expenses" value={money.format(totals.expenses)} note="Tracked locally" icon={<WalletCards />} tone="lemon" />
            <Metric title="Net Profit" value={money.format(totals.netProfit)} note="After expenses" icon={<Sparkles />} tone="purple" />
            <Metric title="Stock Left" value={totals.stock} note="Across products" icon={<Archive />} tone="lavender" />
          </div>
          <div className="report-card glass">
            <h2>Sales History</h2>
            {sales.filter((sale) => orderStatus(sale) === 'sold').length === 0 && <p className="empty-note">No sold orders yet.</p>}
            {sales.filter((sale) => orderStatus(sale) === 'sold').slice(0, 8).map((sale) => (
              <button className="sale-history-row" key={sale.id} onClick={() => onViewSale(sale)}>
                <span>{sale.productName}</span>
                <strong>{money.format(sale.total)}</strong>
                <small>{sale.customerName}</small>
              </button>
            ))}
          </div>
        </>
      ) : view === 'profit' ? (
        <ProfitView profitView={profitView} sales={sales} />
      ) : (
        <TodaysOrders
          sales={sales}
          onChangeOrderStatus={onChangeOrderStatus}
          onDeleteOrder={onDeleteOrder}
          onViewSale={onViewSale}
        />
      )}
    </div>
  );
}

function TodaysOrders({ sales, onChangeOrderStatus, onDeleteOrder, onEditOrder, onViewSale }) {
  const todaysSales = sales.filter((sale) => isToday(sale.createdAt));

  return (
    <div className="today-orders">
      <div className="section-title">
        <h2>Today's Orders</h2>
        <span className="today-count">{todaysSales.length}</span>
      </div>
      {todaysSales.length === 0 && <EmptyState title="No orders today" text="Pending and sold orders created today will appear here." />}
      {todaysSales.map((sale) => {
        const status = orderStatus(sale);
        const items = orderItems(sale);

        return (
          <article className="today-order-card glass" key={sale.id}>
            <div className="today-order-head">
              <div>
                <strong>{sale.customerName}</strong>
                <span>{sale.phone || 'No phone'} - {formatReceiptDate(sale.createdAt)}</span>
              </div>
              <em className={`status-pill ${status}`}>{status}</em>
            </div>
            <div className="today-order-items">
              {items.map((item, index) => (
                <p key={`${sale.id}-${index}`}>
                  <span>{item.productName} - Size {item.productSize || '-'}</span>
                  <strong>{item.quantity} x {money.format(item.unitPrice || 0)}</strong>
                </p>
              ))}
            </div>
            <div className="today-order-total">
              <span>{sale.receiptSharedAt ? 'Receipt shared' : sale.receiptGenerated ? 'Receipt generated' : 'No receipt shared'}</span>
              <strong>{money.format(sale.total || 0)}</strong>
            </div>
            <div className="today-order-actions">
              {status === 'pending' && <button onClick={() => onChangeOrderStatus(sale, 'sold')}>Mark Sold</button>}
              {status === 'pending' && <button className="soft-danger" onClick={() => onChangeOrderStatus(sale, 'cancelled')}>Cancel</button>}
              <button onClick={() => onEditOrder(sale)}>Edit</button>
              <button onClick={() => onViewSale(sale)}>Receipt</button>
              <button className="soft-danger" onClick={() => onDeleteOrder(sale)}>Delete</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ProfitView({ profitView, sales }) {
  const { current, sold, productRows } = profitView;
  const soldSales = sales.filter((sale) => orderStatus(sale) === 'sold');

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
        {soldSales.length === 0 && <EmptyState title="No sold orders yet" text="Sold profit appears after orders are marked sold." />}
        {soldSales.slice(0, 6).map((sale) => {
          const saleTotalValue = toMoneyNumber(sale.total);
          const saleProfitValue = toMoneyNumber(sale.profit);
          const saleCostValue = Math.max(0, saleTotalValue - saleProfitValue);

          return (
            <div className="profit-row" key={sale.id}>
              <div>
                <strong>{sale.productName}</strong>
                <span>{sale.quantity} sold to {sale.customerName}</span>
              </div>
              <div>
                <strong className={saleProfitValue < 0 ? 'warning' : 'good'}>{money.format(saleProfitValue)}</strong>
                <span>{money.format(saleCostValue)} cost / {money.format(saleTotalValue)} sold</span>
              </div>
            </div>
          );
        })}
      </div>
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

function Receipt({ sale, onReceiptShared }) {
  const [shareError, setShareError] = useState('');
  const receipt = sale || {
    id: 'preview',
    customerName: 'Amaka Chinedu',
    phone: '08000000000',
    productName: 'Princess Tutu Dress',
    productSize: '3-4Y',
    unitPrice: 12000,
    total: 12000,
    quantity: 1,
    createdAt: new Date().toISOString()
  };
  const receiptNo = `LLT-2026-${String(receipt.id).padStart(4, '0')}`;
  const receiptDate = formatReceiptDate(receipt.createdAt);
  const receiptItems = orderItems(receipt);

  async function shareReceipt() {
    setShareError('');
    try {
      const pdf = await createReceiptPdf({ ...receipt, receiptNo, receiptDate, items: receiptItems });
      const blob = pdf.output('blob');
      const file = new File([blob], `${receiptNo}.pdf`, { type: 'application/pdf' });

      if (!navigator.canShare || !navigator.canShare({ files: [file] }) || !navigator.share) {
        setShareError('Receipt PDF sharing is not available on this device right now. Please try again from the installed app.');
        return;
      }

      await navigator.share({
        files: [file],
        title: `Receipt ${receiptNo}`
      });
      onReceiptShared?.(receipt);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setShareError('Receipt PDF sharing could not be completed. Please try again from the installed app.');
    }
  }

  return (
    <div className="receipt-wrap">
      <div className="receipt-paper">
        <div className="receipt-watermark" aria-hidden="true">
          <img src="/brand-logo.png" alt="" />
          <img src="/brand-logo.png" alt="" />
          <img src="/brand-logo.png" alt="" />
          <img src="/brand-logo.png" alt="" />
        </div>
        <div className="receipt-body">
          <img className="receipt-logo" src="/brand-logo.png" alt="Luxe and Little Treasures logo" />
          <div className="receipt-title">
            <strong>Purchase Receipt</strong>
            <span>Beautiful fashion treasures for little ones</span>
          </div>
          <div className="receipt-meta-grid">
            <div><span>Receipt No.</span><strong>{receiptNo}</strong></div>
            <div><span>Date Issued</span><strong>{receiptDate}</strong></div>
            <div><span>Customer Full Name</span><strong>{receipt.customerName}</strong></div>
            <div><span>Phone Number</span><strong>{receipt.phone || '-'}</strong></div>
          </div>
          <div className="receipt-lines">
            {receiptItems.map((item, index) => (
              <p key={`${receipt.id}-${index}`}>
                <b>{item.productName} / Size {item.productSize || '-'}</b>
                <em>{item.quantity} x {money.format(item.unitPrice || 0)}</em>
              </p>
            ))}
            <p><b>Balance</b><em className="ok">0</em></p>
          </div>
          <div className="receipt-total-row">
            <span>Total Paid</span>
            <strong>{money.format(receipt.total)}</strong>
          </div>
          <div className="receipt-thanks">
            <strong>Thank you for shopping with us.</strong>
            <span>We appreciate your patronage and look forward to serving you again.</span>
          </div>
          <div className="receipt-contact">
            <strong>Luxe & Little Treasures</strong>
            <p><WhatsAppIcon /> <span>{businessContact.phone}</span></p>
            <p><TikTokIcon /> <span>{businessContact.tiktok}</span></p>
            <p><InstagramIcon /> <span>{businessContact.instagram}</span></p>
          </div>
        </div>
      </div>
      {shareError && <p className="share-error">{shareError}</p>}
      <button className="whatsapp-btn" onClick={shareReceipt}><Share2 size={18} /> Share Receipt</button>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.04 3.2a8.62 8.62 0 0 0-7.38 13.06l-.96 3.52 3.6-.94A8.63 8.63 0 1 0 12.04 3.2Zm0 1.74a6.9 6.9 0 1 1-3.54 12.82l-.26-.16-2.14.56.57-2.08-.17-.27a6.9 6.9 0 0 1 5.54-10.87Zm-2.7 3.28c-.15 0-.39.06-.59.28-.2.22-.77.75-.77 1.84 0 1.08.79 2.13.9 2.28.11.15 1.53 2.45 3.8 3.33 1.88.73 2.27.58 2.68.55.41-.04 1.32-.54 1.51-1.06.19-.52.19-.96.13-1.06-.06-.09-.21-.15-.45-.27-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.46-.39-.4-.54-.41h-.47Z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.9 3.2c.28 2.12 1.47 3.39 3.56 3.54v3.02a6.53 6.53 0 0 1-3.5-1.05v5.55c0 3.18-2.04 5.54-5.12 5.54-2.66 0-4.7-1.76-4.7-4.37 0-2.86 2.26-4.75 5.36-4.42v3.08c-1.33-.2-2.18.45-2.18 1.55 0 .9.69 1.49 1.55 1.49 1.09 0 1.76-.75 1.76-2.22V3.2h3.27Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.1 3.8h7.8a4.32 4.32 0 0 1 4.3 4.3v7.8a4.32 4.32 0 0 1-4.3 4.3H8.1a4.32 4.32 0 0 1-4.3-4.3V8.1a4.32 4.32 0 0 1 4.3-4.3Zm0 1.9a2.42 2.42 0 0 0-2.4 2.4v7.8a2.42 2.42 0 0 0 2.4 2.4h7.8a2.42 2.42 0 0 0 2.4-2.4V8.1a2.42 2.42 0 0 0-2.4-2.4H8.1Zm3.9 2.7a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Zm0 1.9a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Zm4.05-2.27a.84.84 0 1 1 0 1.68.84.84 0 0 1 0-1.68Z" />
    </svg>
  );
}

async function createReceiptPdf(receipt) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const right = pageWidth - margin;
  let y = 24;

  doc.setFillColor(255, 247, 251);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  doc.setFillColor(255, 254, 242);
  doc.circle(pageWidth - 18, 16, 48, 'F');
  doc.setFillColor(248, 241, 255);
  doc.circle(pageWidth - 4, pageHeight - 18, 58, 'F');
  doc.setTextColor(255, 232, 245);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  ['L&LT', 'L&LT', 'L&LT', 'L&LT'].forEach((mark, index) => {
    const positions = [[32, 76], [150, 114], [54, 188], [150, 236]];
    doc.text(mark, positions[index][0], positions[index][1], { angle: index % 2 ? 14 : -16 });
  });
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, 14, contentWidth, 246, 6, 6, 'F');

  doc.setTextColor(255, 47, 152);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Luxe & Little Treasures', pageWidth / 2, y + 10, { align: 'center' });
  y += 26;
  doc.setTextColor(118, 95, 121);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Purchase Receipt', pageWidth / 2, y, { align: 'center' });
  y += 15;

  doc.setDrawColor(234, 220, 236);
  doc.line(margin + 8, y, right - 8, y);
  y += 10;

  drawPdfRow(doc, 'Receipt No.', receipt.receiptNo, margin + 8, right - 8, y);
  y += 9;
  drawPdfRow(doc, 'Date', receipt.receiptDate, margin + 8, right - 8, y);
  y += 9;
  drawPdfRow(doc, 'Customer', receipt.customerName || '-', margin + 8, right - 8, y);
  y += 9;
  drawPdfRow(doc, 'Phone', receipt.phone || '-', margin + 8, right - 8, y);
  y += 11;

  const items = receipt.items || orderItems(receipt);
  const itemBoxHeight = Math.max(58, 18 + items.length * 10);
  doc.setFillColor(255, 248, 253);
  doc.roundedRect(margin + 8, y, contentWidth - 16, itemBoxHeight, 4, 4, 'F');
  y += 10;
  items.forEach((item) => {
    const itemLabel = `${item.productName || '-'} / Size ${item.productSize || '-'}`;
    const itemValue = `${item.quantity || 1} x ${pdfMoney(item.unitPrice || 0)}`;
    drawPdfRow(doc, itemLabel, itemValue, margin + 14, right - 14, y);
    y += 10;
  });
  drawPdfRow(doc, 'Balance', '0', margin + 14, right - 14, y);
  y += 18;

  doc.setFillColor(255, 47, 152);
  doc.roundedRect(margin + 8, y, contentWidth - 16, 18, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Total Paid', margin + 14, y + 11);
  doc.text(pdfMoney(receipt.total || 0), right - 14, y + 11, { align: 'right' });
  y += 33;

  doc.setTextColor(35, 18, 39);
  doc.setFontSize(12);
  doc.text('Thank you for shopping with us.', pageWidth / 2, y, { align: 'center' });
  y += 7;
  doc.setTextColor(118, 95, 121);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('We appreciate your patronage and look forward to serving you again.', pageWidth / 2, y, { align: 'center' });
  y += 17;

  doc.setFillColor(255, 248, 253);
  doc.roundedRect(margin + 8, y, contentWidth - 16, 30, 4, 4, 'F');
  doc.setTextColor(145, 54, 221);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Luxe & Little Treasures', pageWidth / 2, y + 8, { align: 'center' });
  doc.setTextColor(118, 95, 121);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  drawPdfSocialIcon(doc, 'whatsapp', 62, y + 15);
  doc.text(businessContact.phone, 68, y + 16);
  drawPdfSocialIcon(doc, 'tiktok', 62, y + 22);
  doc.text(businessContact.tiktok, 68, y + 23);
  drawPdfSocialIcon(doc, 'instagram', 120, y + 22);
  doc.text(businessContact.instagram, 126, y + 23);

  return doc;
}

function drawPdfSocialIcon(doc, type, x, y) {
  doc.setDrawColor(255, 47, 152);
  doc.setFillColor(255, 47, 152);
  if (type === 'whatsapp') {
    doc.circle(x, y - 1.2, 2.2, 'S');
    doc.line(x - 1, y + 0.9, x - 2, y + 2.4);
    doc.line(x - 0.8, y - 1.2, x + 0.8, y + 0.3);
    return;
  }

  if (type === 'tiktok') {
    doc.line(x, y - 3, x, y + 1);
    doc.line(x, y - 3, x + 2.2, y - 2.2);
    doc.circle(x - 1.2, y + 1.2, 1.2, 'S');
    return;
  }

  doc.roundedRect(x - 2.2, y - 3.4, 4.4, 4.4, 0.8, 0.8, 'S');
  doc.circle(x, y - 1.2, 1, 'S');
  doc.circle(x + 1.35, y - 2.7, 0.25, 'F');
}

function drawPdfRow(doc, label, value, left, right, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(118, 95, 121);
  doc.text(label, left, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(35, 18, 39);
  doc.text(String(value), right, y, { align: 'right', maxWidth: right - left - 46 });
}

function ProductSheet({ product, onClose, onSave, settings }) {
  const [draft, setDraft] = useState(product);
  const draftValuation = productValuation(draft);

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

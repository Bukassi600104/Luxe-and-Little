import Dexie from 'dexie';

export const db = new Dexie('luxeLittleTreasuresDB');

db.version(1).stores({
  products: 'id, name, category, qty, status',
  customers: 'phone, name, balance',
  sales: '++id, customerName, productId, createdAt',
  expenses: '++id, label, amount'
});

db.version(2).stores({
  products: 'id, name, category, qty, status',
  customers: 'phone, name, balance',
  sales: '++id, customerName, productId, createdAt',
  expenses: '++id, label, amount',
  settings: 'key'
});

db.version(3).stores({
  products: 'id, name, category, qty, status',
  customers: 'phone, name, balance',
  sales: '++id, customerName, productId, createdAt',
  expenses: '++id, label, amount',
  settings: 'key'
});

export function stockStatus(quantity, threshold = 10) {
  return Number(quantity) <= Number(threshold) ? 'Low Stock' : 'In Stock';
}

export async function seedDatabase({ products, customers, expenses }) {
  const productCount = await db.products.count();
  if (productCount > 0) return;

  await db.transaction('rw', db.products, db.customers, db.expenses, async () => {
    await db.products.bulkPut(products);
    await db.customers.bulkPut(customers);
    await db.expenses.bulkPut(expenses);
  });
}

function saleItems(sale) {
  if (Array.isArray(sale.items) && sale.items.length) return sale.items;
  return [{
    productId: sale.productId,
    productName: sale.productName,
    productSize: sale.productSize,
    quantity: Number(sale.quantity || 1),
    unitPrice: Number(sale.unitPrice || sale.total || 0),
    costPrice: Number(sale.costPrice || Math.max(0, Number(sale.total || 0) - Number(sale.profit || 0)))
  }];
}

function totalsFromItems(items) {
  return items.reduce((acc, item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const costPrice = Number(item.costPrice || 0);
    return {
      quantity: acc.quantity + quantity,
      total: acc.total + unitPrice * quantity,
      profit: acc.profit + (unitPrice - costPrice) * quantity
    };
  }, { quantity: 0, total: 0, profit: 0 });
}

async function adjustStock(items, direction, lowStockThreshold) {
  const updatedProducts = [];

  for (const item of items) {
    const product = await db.products.get(Number(item.productId));
    if (!product) continue;
    const nextQuantity = Math.max(0, Number(product.qty || 0) + direction * Number(item.quantity || 0));
    const updatedProduct = {
      ...product,
      qty: nextQuantity,
      status: stockStatus(nextQuantity, lowStockThreshold)
    };
    await db.products.put(updatedProduct);
    updatedProducts.push(updatedProduct);
  }

  return updatedProducts;
}

export async function recordSale({ items, customerName, phone, lowStockThreshold = 10 }) {
  const normalizedItems = items.map((item) => ({
    productId: Number(item.productId),
    productName: item.productName,
    productSize: item.productSize,
    quantity: Number(item.quantity || 1),
    unitPrice: Number(item.unitPrice || 0),
    costPrice: Number(item.costPrice || 0)
  }));
  const totals = totalsFromItems(normalizedItems);
  const firstItem = normalizedItems[0] || {};
  const sale = {
    customerName,
    phone,
    items: normalizedItems,
    productId: firstItem.productId,
    productName: normalizedItems.length > 1 ? `${firstItem.productName} +${normalizedItems.length - 1}` : firstItem.productName,
    productSize: firstItem.productSize,
    quantity: totals.quantity,
    unitPrice: firstItem.unitPrice || 0,
    total: totals.total,
    profit: totals.profit,
    status: 'pending',
    receiptGenerated: false,
    receiptSharedAt: '',
    inventoryRestored: false,
    createdAt: new Date().toISOString()
  };

  let updatedProducts = [];
  await db.transaction('rw', db.products, db.sales, async () => {
    updatedProducts = await adjustStock(normalizedItems, -1, lowStockThreshold);
    sale.id = await db.sales.add(sale);
  });

  return { updatedProducts, sale };
}

export async function updateSaleStatus(id, status, lowStockThreshold = 10) {
  let sale;
  let updatedProducts = [];

  await db.transaction('rw', db.products, db.sales, async () => {
    sale = await db.sales.get(id);
    if (!sale) throw new Error('Order not found');
    const previousStatus = sale.status || 'sold';
    const updates = { status };

    if (status === 'sold') {
      updates.soldAt = new Date().toISOString();
    }

    if (status === 'cancelled' && previousStatus !== 'cancelled' && !sale.inventoryRestored) {
      updatedProducts = await adjustStock(saleItems(sale), 1, lowStockThreshold);
      updates.cancelledAt = new Date().toISOString();
      updates.inventoryRestored = true;
    }

    sale = { ...sale, ...updates };
    await db.sales.put(sale);
  });

  return { sale, updatedProducts };
}

export async function deleteSale(id, lowStockThreshold = 10) {
  let updatedProducts = [];

  await db.transaction('rw', db.products, db.sales, async () => {
    const sale = await db.sales.get(id);
    if (!sale) return;
    const status = sale.status || 'sold';
    if (status !== 'cancelled' && !sale.inventoryRestored) {
      updatedProducts = await adjustStock(saleItems(sale), 1, lowStockThreshold);
    }
    await db.sales.delete(id);
  });

  return { updatedProducts };
}

export async function markReceiptShared(id) {
  const sale = await db.sales.get(id);
  if (!sale) return null;
  const updated = {
    ...sale,
    receiptGenerated: true,
    receiptSharedAt: new Date().toISOString()
  };
  await db.sales.put(updated);
  return updated;
}

export async function updateSaleDetails(id, updates) {
  const sale = await db.sales.get(id);
  if (!sale) return null;
  const updated = {
    ...sale,
    customerName: updates.customerName?.trim() || sale.customerName,
    phone: updates.phone?.trim() || sale.phone,
    updatedAt: new Date().toISOString()
  };
  await db.sales.put(updated);
  return updated;
}

export async function saveProduct(product, lowStockThreshold = 10) {
  const normalized = {
    ...product,
    id: product.id || Date.now(),
    qty: Number(product.qty || 0),
    cost: Number(product.cost || 0),
    price: Number(product.price || 0)
  };
  normalized.status = stockStatus(normalized.qty, lowStockThreshold);
  await db.products.put(normalized);
  return normalized;
}

export async function removeProduct(id) {
  await db.products.delete(id);
}

export async function saveExpense(expense) {
  const normalized = {
    ...expense,
    amount: Number(expense.amount || 0),
    createdAt: expense.createdAt || new Date().toISOString()
  };
  normalized.id = expense.id || await db.expenses.add(normalized);
  if (expense.id) await db.expenses.put(normalized);
  return normalized;
}

export async function removeExpense(id) {
  await db.expenses.delete(id);
}

export async function saveCustomer(customer) {
  const normalized = {
    ...customer,
    phone: customer.phone.trim(),
    name: customer.name.trim(),
    address: customer.address || '',
    notes: customer.notes || '',
    balance: Number(customer.balance || 0),
    last: customer.last || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    orders: Number(customer.orders || 0)
  };
  await db.customers.put(normalized);
  return normalized;
}

export async function removeCustomer(phone) {
  await db.customers.delete(phone);
}

export async function getBusinessSettings() {
  return db.settings.get('business');
}

export async function saveBusinessSettings(settings) {
  const normalized = {
    ...settings,
    key: 'business',
    lowStockThreshold: Number(settings.lowStockThreshold || 10),
    stockCategories: settings.stockCategories.filter(Boolean),
    sizeTypes: settings.sizeTypes.filter(Boolean),
    expenseCategories: settings.expenseCategories.filter(Boolean),
    setupComplete: true,
    updatedAt: new Date().toISOString()
  };
  await db.settings.put(normalized);
  return normalized;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function saveSecuritySettings(pin) {
  const salt = crypto.getRandomValues(new Uint32Array(4)).join('-');
  const pinHash = await sha256(`${salt}:${pin}`);
  const security = {
    key: 'security',
    pinHash,
    salt,
    updatedAt: new Date().toISOString()
  };
  await db.settings.put(security);
  return security;
}

export async function getSecuritySettings() {
  return db.settings.get('security');
}

export async function verifyPin(pin, security) {
  if (!security?.pinHash || !security?.salt) return false;
  return sha256(`${security.salt}:${pin}`).then((pinHash) => pinHash === security.pinHash);
}

export async function exportBusinessData() {
  const [products, customers, sales, expenses, settings] = await Promise.all([
    db.products.toArray(),
    db.customers.toArray(),
    db.sales.toArray(),
    db.expenses.toArray(),
    db.settings.toArray()
  ]);

  return {
    exportedAt: new Date().toISOString(),
    app: 'Luxe & Little Treasures Business Manager',
    version: '1.1.0',
    products,
    customers,
    sales,
    expenses,
    settings
  };
}

export async function importBusinessData(data) {
  if (
    !data ||
    data.app !== 'Luxe & Little Treasures Business Manager' ||
    !Array.isArray(data.products) ||
    !Array.isArray(data.customers) ||
    !Array.isArray(data.sales) ||
    !Array.isArray(data.expenses) ||
    !Array.isArray(data.settings)
  ) {
    throw new Error('Invalid backup file');
  }

  await db.transaction('rw', db.products, db.customers, db.sales, db.expenses, db.settings, async () => {
    await Promise.all([
      db.products.clear(),
      db.customers.clear(),
      db.sales.clear(),
      db.expenses.clear(),
      db.settings.clear()
    ]);

    await Promise.all([
      db.products.bulkPut(data.products || []),
      db.customers.bulkPut(data.customers || []),
      db.sales.bulkPut(data.sales || []),
      db.expenses.bulkPut(data.expenses || []),
      db.settings.bulkPut(data.settings || [])
    ]);
  });
}

export async function clearBusinessData() {
  await db.transaction('rw', db.products, db.customers, db.sales, db.expenses, async () => {
    await Promise.all([
      db.products.clear(),
      db.customers.clear(),
      db.sales.clear(),
      db.expenses.clear()
    ]);
  });
}

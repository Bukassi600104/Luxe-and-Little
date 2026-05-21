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

export async function recordSale({ product, quantity, customerName, phone, lowStockThreshold = 10 }) {
  const newQuantity = Math.max(0, product.qty - quantity);
  const updatedProduct = {
    ...product,
    qty: newQuantity,
    status: stockStatus(newQuantity, lowStockThreshold)
  };
  const sale = {
    customerName,
    phone,
    productId: product.id,
    productName: product.name,
    productSize: product.size,
    quantity,
    unitPrice: product.price,
    total: product.price * quantity,
    profit: (product.price - product.cost) * quantity,
    createdAt: new Date().toISOString()
  };

  await db.transaction('rw', db.products, db.sales, async () => {
    await db.products.put(updatedProduct);
    sale.id = await db.sales.add(sale);
  });

  return { updatedProduct, sale };
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
    version: 1,
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

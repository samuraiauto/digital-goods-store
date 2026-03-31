import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, "..", "data");
const ordersFile = path.resolve(dataDir, "orders.json");

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(ordersFile);
  } catch {
    await fs.writeFile(ordersFile, JSON.stringify({ orders: {} }, null, 2), "utf8");
  }
}

async function readAll() {
  await ensureStore();
  const raw = await fs.readFile(ordersFile, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed.orders) parsed.orders = {};
  return parsed;
}

async function writeAll(data) {
  await ensureStore();
  const tmp = ordersFile + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, ordersFile);
}

export const ordersStore = {
  async create(order) {
    const data = await readAll();
    data.orders[order.id] = order;
    await writeAll(data);
    return order;
  },

  async get(orderId) {
    const data = await readAll();
    return data.orders[orderId] ?? null;
  },

  async update(orderId, patch) {
    const data = await readAll();
    const existing = data.orders[orderId];
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    data.orders[orderId] = updated;
    await writeAll(data);
    return updated;
  },
};


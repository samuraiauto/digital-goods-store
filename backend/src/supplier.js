// Интеграция с B2B API поставщика.
// Здесь мы НЕ храним ключи в коде — только через переменные окружения.

function supplierUrl(pathname) {
  const baseUrl = process.env.SUPPLIER_BASE_URL?.trim();
  if (!baseUrl) throw new Error("SUPPLIER_BASE_URL is required");
  return `${baseUrl.replace(/\\/+$/, "")}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
}

function supplierHeaders() {
  const apiKey = process.env.SUPPLIER_API_KEY?.trim();
  if (!apiKey) throw new Error("SUPPLIER_API_KEY is required");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export async function fetchSupplierCatalog() {
  const catalogPath = (process.env.SUPPLIER_CATALOG_PATH?.trim() || "/products").trim();

  const resp = await fetch(supplierUrl(catalogPath), {
    method: "GET",
    headers: supplierHeaders(),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Supplier catalog error: ${resp.status} ${text}`);
  }

  const data = await resp.json();

  // Пытаемся “нормализовать” каталог под формат фронта.
  // Реальная структура зависит от поставщика — при наличии примера ответа уточним точно.
  const arr =
    (Array.isArray(data) && data) ||
    (Array.isArray(data?.items) && data.items) ||
    (Array.isArray(data?.products) && data.products) ||
    (Array.isArray(data?.data) && data.data) ||
    [];

  const products = arr
    .map((p, idx) => {
      const supplierProductId = String(p?.id ?? p?.productId ?? p?.sku ?? "");
      const name = String(p?.name ?? p?.title ?? "").trim();
      const price = Number(p?.price ?? p?.priceRub ?? p?.amount ?? 0);
      const category = String(p?.category ?? p?.type ?? "other").toLowerCase();
      const description = String(p?.description ?? p?.desc ?? "").trim();

      if (!supplierProductId || !name || !Number.isFinite(price) || price <= 0) return null;

      return {
        id: idx + 1, // локальный id для корзины
        name,
        category,
        supplierProductId,
        price,
        description,
        features: Array.isArray(p?.features) ? p.features.map(String) : [],
        emoji: category.includes("esim") ? "📶" : category.includes("gift") ? "🎁" : "🧾",
      };
    })
    .filter(Boolean);

  return { products };
}

export async function fulfillFromSupplier(order) {
  const baseUrl = process.env.SUPPLIER_BASE_URL?.trim();
  const apiKey = process.env.SUPPLIER_API_KEY?.trim();

  if (!baseUrl || !apiKey) {
    // Чтобы вы могли запустить проект до подключения API.
    return {
      mode: "mock",
      message:
        "Поставщик не настроен. Укажите SUPPLIER_BASE_URL и SUPPLIER_API_KEY в .env и реализуйте запрос в backend/src/supplier.js",
      deliveredItems: order.items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        codes: Array.from({ length: it.quantity }, () => "DEMO-CODE-NOT-FOR-PRODUCTION"),
      })),
    };
  }

  // Ниже — заглушка “универсального” запроса. Реальные поля/эндпоинты зависят от документации поставщика.
  // После того как вы дадите схему API, я заменю на точные вызовы.
  const deliveredItems = [];

  for (const item of order.items) {
    if (!item.supplierProductId) {
      throw new Error(`supplierProductId missing for item "${item.name}"`);
    }

    const codes = [];
    for (let i = 0; i < item.quantity; i++) {
      const resp = await fetch(`${baseUrl.replace(/\/+$/, "")}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          productId: item.supplierProductId,
          customerEmail: order.email,
          externalOrderId: order.id,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Supplier API error: ${resp.status} ${text}`);
      }

      const data = await resp.json();
      // ожидаем, что поставщик вернет код/ключ в одном из полей:
      const code = data.code || data.key || data.activationCode || data.data?.code;
      if (!code) throw new Error("Supplier response does not contain a code/key");
      codes.push(String(code));
    }

    deliveredItems.push({
      name: item.name,
      quantity: item.quantity,
      codes,
    });
  }

  return {
    mode: "live",
    deliveredItems,
  };
}


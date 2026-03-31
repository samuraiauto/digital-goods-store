// Интеграция с B2B API поставщика.
// Здесь мы НЕ храним ключи в коде — только через переменные окружения.

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


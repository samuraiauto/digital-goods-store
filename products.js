// Данные цифровых продуктов (пример).
// ВАЖНО: для интеграции с B2B поставщиком у каждого товара должен быть supplierProductId.
const products = [
    {
        id: 1,
        name: "eSIM Европа 10GB / 30 дней",
        category: "esim",
        supplierProductId: "SUPPLIER_PRODUCT_ID_1",
        price: 1490,
        description: "Цифровая eSIM. Доставка на email после оплаты. Подходит для путешествий по Европе.",
        features: ["Доставка на email", "Активация по QR/коду", "Срок: 30 дней"],
        emoji: "📶"
    },
    {
        id: 2,
        name: "Apple Gift Card 1000 ₽",
        category: "giftcards",
        supplierProductId: "SUPPLIER_PRODUCT_ID_2",
        price: 1100,
        description: "Подарочная карта Apple. Код будет отправлен на email после подтверждения оплаты.",
        features: ["Доставка на email", "Код активации", "Для App Store / iTunes"],
        emoji: "🎁"
    }
];

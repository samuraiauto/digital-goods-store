// Корзина
let cart = JSON.parse(localStorage.getItem('cart')) || [];

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    renderProducts();
    updateCartCount();
    setupEventListeners();
    setupSmoothScroll();
});

// Рендеринг продуктов
function renderProducts(filter = 'all') {
    const productsGrid = document.getElementById('productsGrid');
    const filteredProducts = filter === 'all' 
        ? products 
        : products.filter(p => p.category === filter);

    productsGrid.innerHTML = filteredProducts.map(product => `
        <div class="product-card" data-product-id="${product.id}">
            <div class="product-image">${product.emoji}</div>
            <div class="product-info">
                <div class="product-category">${product.category === 'esim' ? 'eSIM' : 'Подарочная карта'}</div>
                <h3 class="product-name">${product.name}</h3>
                <p class="product-description">${product.description}</p>
                <div class="product-footer">
                    <div class="product-price">${formatPrice(product.price)}</div>
                    <button class="add-to-cart" onclick="addToCart(${product.id})">
                        В корзину
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    // Добавляем обработчики клика на карточки продуктов
    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('add-to-cart')) {
                const productId = parseInt(card.dataset.productId);
                showProductModal(productId);
            }
        });
    });
}

// Фильтрация продуктов
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter;
        renderProducts(filter);
    });
});

// Добавление в корзину
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            ...product,
            quantity: 1
        });
    }

    saveCart();
    updateCartCount();
    showNotification('Товар добавлен в корзину!');
}

// Удаление из корзины
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
    updateCartCount();
    renderCart();
    showNotification('Товар удален из корзины');
}

// Очистка корзины
function clearCart() {
    if (cart.length === 0) return;
    
    if (confirm('Вы уверены, что хотите очистить корзину?')) {
        cart = [];
        saveCart();
        updateCartCount();
        renderCart();
        showNotification('Корзина очищена');
    }
}

// Сохранение корзины
function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

// Обновление счетчика корзины
function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cartCount').textContent = count;
}

// Рендеринг корзины
function renderCart() {
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');

    if (cart.length === 0) {
        cartItems.innerHTML = '<div class="empty-cart">Корзина пуста</div>';
        cartTotal.textContent = '0';
        return;
    }

    cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">${formatPrice(item.price)} × ${item.quantity}</div>
            </div>
            <button class="cart-item-remove" onclick="removeFromCart(${item.id})">
                Удалить
            </button>
        </div>
    `).join('');

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cartTotal.textContent = formatPrice(total);
}

// Форматирование цены
function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
}

// Показ модального окна корзины
function showCartModal() {
    renderCart();
    document.getElementById('cartModal').classList.add('show');
}

// Закрытие модального окна корзины
function closeCartModal() {
    document.getElementById('cartModal').classList.remove('show');
}

// Показ модального окна продукта
function showProductModal(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const modal = document.getElementById('productModal');
    document.getElementById('modalProductName').textContent = product.name;
    
    document.getElementById('modalProductContent').innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
            <div style="text-align: center;">
                <div style="font-size: 8rem; margin-bottom: 1rem;">${product.emoji}</div>
                <div style="font-size: 2rem; font-weight: 700; color: var(--primary-color); margin-bottom: 1rem;">
                    ${formatPrice(product.price)}
                </div>
                <button class="btn btn-primary" style="width: 100%;" onclick="addToCart(${product.id}); closeProductModal();">
                    Добавить в корзину
                </button>
            </div>
            <div>
                <h3 style="color: var(--primary-color); margin-bottom: 1rem;">Описание</h3>
                <p style="color: var(--text-light); margin-bottom: 1.5rem; line-height: 1.8;">
                    ${product.description}
                </p>
                <h3 style="color: var(--primary-color); margin-bottom: 1rem;">Характеристики</h3>
                <ul style="list-style: none; padding: 0;">
                    ${product.features.map(feature => `
                        <li style="padding: 0.5rem 0; color: var(--text-dark);">
                            <strong style="color: var(--primary-color);">✓</strong> ${feature}
                        </li>
                    `).join('')}
                </ul>
            </div>
        </div>
    `;

    modal.classList.add('show');
}

// Закрытие модального окна продукта
function closeProductModal() {
    document.getElementById('productModal').classList.remove('show');
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Корзина
    document.getElementById('cartIcon').addEventListener('click', showCartModal);
    document.getElementById('closeCart').addEventListener('click', closeCartModal);
    document.getElementById('clearCart').addEventListener('click', clearCart);
    document.getElementById('checkout').addEventListener('click', () => {
        if (cart.length === 0) {
            alert('Корзина пуста');
            return;
        }
        const emailInput = document.getElementById('checkoutEmail');
        const email = (emailInput?.value || '').trim();
        if (!email || !email.includes('@')) {
            alert('Введите корректный email для доставки цифрового товара');
            return;
        }
        // Пока сайт полностью статический: формируем заказ и открываем письмо продавцу.
        // Позже заменим на создание платежа (ЮKassa) и автоматическую выдачу.
        const orderText = buildOrderText(email);
        const shopEmail = 'sales@example.com'; // замените на ваш email
        const subject = encodeURIComponent('Новый заказ цифрового товара');
        const body = encodeURIComponent(orderText);
        window.location.href = `mailto:${shopEmail}?subject=${subject}&body=${body}`;

        alert('Заказ сформирован. Сейчас откроется ваше почтовое приложение для отправки заявки. После оплаты мы отправим товар на указанный email.');
        clearCart();
        closeCartModal();
    });

    // Модальное окно продукта
    document.getElementById('closeProduct').addEventListener('click', closeProductModal);

    // Закрытие модальных окон при клике вне их
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    });

    // Форма обратной связи
    document.getElementById('contactForm').addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Спасибо за ваше сообщение! Мы свяжемся с вами в ближайшее время.');
        e.target.reset();
    });
}

function buildOrderText(customerEmail) {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const lines = [];
    lines.push('Заявка на покупку цифрового товара');
    lines.push('');
    lines.push(`Email для доставки: ${customerEmail}`);
    lines.push('');
    lines.push('Товары:');
    cart.forEach((item) => {
        lines.push(`- ${item.name} × ${item.quantity} = ${formatPrice(item.price * item.quantity)}`);
    });
    lines.push('');
    lines.push(`Итого: ${formatPrice(total)}`);
    lines.push('');
    lines.push('Комментарий: (при необходимости)');
    return lines.join('\n');
}

// Плавная прокрутка
function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Уведомления
function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: var(--primary-color);
        color: white;
        padding: 1rem 2rem;
        border-radius: 50px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        z-index: 3000;
        animation: slideInRight 0.3s ease;
        font-weight: 600;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Добавляем стили для анимации уведомлений
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

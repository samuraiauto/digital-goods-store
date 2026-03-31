#!/bin/bash

# Скрипт для загрузки проекта на GitHub
# Использование: ./deploy-to-github.sh <URL_вашего_репозитория_на_GitHub>

if [ -z "$1" ]; then
    echo "❌ Ошибка: Укажите URL вашего репозитория на GitHub"
    echo "Пример использования: ./deploy-to-github.sh https://github.com/username/iDaLatex.git"
    echo ""
    echo "Или выполните команды вручную:"
    echo "1. Создайте репозиторий на GitHub (https://github.com/new)"
    echo "2. Затем выполните:"
    echo "   git remote add origin https://github.com/username/iDaLatex.git"
    echo "   git branch -M main"
    echo "   git push -u origin main"
    exit 1
fi

REPO_URL=$1

echo "🚀 Подключение к GitHub репозиторию..."
git remote add origin $REPO_URL 2>/dev/null || git remote set-url origin $REPO_URL

echo "📦 Установка ветки main..."
git branch -M main

echo "⬆️  Загрузка файлов на GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo "✅ Успешно! Ваш проект загружен на GitHub!"
    echo "🌐 Откройте репозиторий: $REPO_URL"
else
    echo "❌ Ошибка при загрузке. Проверьте:"
    echo "   - Правильность URL репозитория"
    echo "   - Настройки авторизации GitHub (SSH ключи или токен)"
fi

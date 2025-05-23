// Content Script для OnlyFans Manager Pro
// Взаимодействует с DOM страницы OnlyFans

console.log('OnlyFans Manager Pro - Content script загружен на:', window.location.href);

// Проверяем, что мы на правильной странице
const isOnlyFansPage = window.location.hostname.includes('onlyfans.com');
const isSubscribersPage = window.location.pathname.includes('subscribers');

if (isOnlyFansPage) {
    console.log('Обнаружена страница OnlyFans');
    
    // Инициализация наблюдателя за изменениями DOM
    initializeDOMObserver();
    
    // Добавляем индикатор активности расширения
    addExtensionIndicator();
}

// Инициализация наблюдателя за DOM
function initializeDOMObserver() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                // Проверяем появление новых элементов фанатов
                checkForNewFans(mutation.addedNodes);
            }
        });
    });
    
    // Начинаем наблюдение
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    console.log('DOM Observer инициализирован');
}

// Проверка новых фанатов на странице
function checkForNewFans(addedNodes) {
    addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            // TODO: Определить селекторы для элементов фанатов
            // Ищем элементы, которые могут содержать информацию о фанатах
            const fanElements = node.querySelectorAll && node.querySelectorAll('[data-testid], .subscriber, .user-card');
            
            if (fanElements && fanElements.length > 0) {
                console.log(`Найдено ${fanElements.length} элементов фанатов`);
                analyzeFanElements(fanElements);
            }
        }
    });
}

// Анализ элементов фанатов
function analyzeFanElements(elements) {
    const fans = [];
    
    elements.forEach((element) => {
        try {
            // TODO: Извлечь данные фаната из элемента
            const fanData = extractFanData(element);
            if (fanData) {
                fans.push(fanData);
            }
        } catch (error) {
            console.error('Ошибка анализа элемента фаната:', error);
        }
    });
    
    if (fans.length > 0) {
        // Отправляем данные в background script
        chrome.runtime.sendMessage({
            type: 'FANS_FOUND',
            data: fans
        });
    }
}

// Извлечение данных фаната из DOM элемента (заглушка)
function extractFanData(element) {
    // TODO: Реализовать извлечение реальных данных
    const fanData = {
        name: 'Unknown',
        username: 'unknown',
        isOnline: false,
        avatar: null,
        element: element
    };
    
    // Попытка найти имя
    const nameElement = element.querySelector('.name, .username, [data-testid*="name"]');
    if (nameElement) {
        fanData.name = nameElement.textContent?.trim() || 'Unknown';
    }
    
    // Попытка определить онлайн статус
    const onlineIndicator = element.querySelector('.online, .status-online, [data-testid*="online"]');
    if (onlineIndicator) {
        fanData.isOnline = true;
    }
    
    return fanData;
}

// Добавление индикатора активности расширения
function addExtensionIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'of-manager-queue-counter';
    indicator.textContent = 'OF Manager: Активно';
    indicator.style.display = 'none'; // Скрыто по умолчанию
    
    document.body.appendChild(indicator);
    
    // Показываем индикатор при активности
    window.ofManagerIndicator = indicator;
}

// Обработка сообщений от popup и background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script получил сообщение:', message);
    
    switch (message.type) {
        case 'SCAN_FANS':
            // Сканирование фанатов на текущей странице
            const fans = scanCurrentPageForFans();
            sendResponse({ fans });
            break;
            
        case 'SEND_MESSAGE':
            // Отправка сообщения конкретному фанату
            sendMessageToFan(message.data);
            break;
            
        case 'UPDATE_INDICATOR':
            // Обновление индикатора
            updateIndicator(message.data);
            break;
    }
});

// Сканирование текущей страницы для поиска фанатов (заглушка)
function scanCurrentPageForFans() {
    console.log('Сканирование страницы для поиска фанатов');
    
    // TODO: Реализовать реальное сканирование
    const mockFans = [
        { name: 'Тестовый фанат 1', isOnline: true, username: 'test1' },
        { name: 'Тестовый фанат 2', isOnline: false, username: 'test2' }
    ];
    
    return mockFans;
}

// Отправка сообщения фанату (заглушка)
function sendMessageToFan(data) {
    console.log('Отправка сообщения фанату:', data);
    
    // TODO: Реализовать реальную отправку сообщения
    // 1. Найти элемент фаната
    // 2. Кликнуть на кнопку сообщения
    // 3. Ввести текст
    // 4. Отправить
    
    // Имитация успешной отправки
    setTimeout(() => {
        chrome.runtime.sendMessage({
            type: 'MESSAGE_SENT',
            data: {
                fanName: data.fanName,
                success: true,
                timestamp: Date.now()
            }
        });
    }, 2000);
}

// Обновление индикатора активности
function updateIndicator(data) {
    if (window.ofManagerIndicator) {
        if (data.show) {
            window.ofManagerIndicator.style.display = 'block';
            window.ofManagerIndicator.textContent = data.text || 'OF Manager: Активно';
        } else {
            window.ofManagerIndicator.style.display = 'none';
        }
    }
}

// Автоматическое сканирование при загрузке страницы
if (isSubscribersPage) {
    setTimeout(() => {
        console.log('Автоматическое сканирование фанатов');
        const fans = scanCurrentPageForFans();
        
        if (fans.length > 0) {
            chrome.runtime.sendMessage({
                type: 'FANS_FOUND',
                data: fans
            });
        }
    }, 2000);
} 
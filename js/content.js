// Content Script для OnlyFans Manager Pro
// БЕЗОПАСНЫЙ режим - минимальная активность при включении

console.log('🎯 OnlyFans Manager Pro - Content script загружен');

// Глобальные переменные
let authToken = null;
let userAgent = null;
let isInitialized = false;

// API endpoints OnlyFans
const API_ENDPOINTS = {
    sendMessage: '/api2/v2/chats/sendMessage',
    getUser: '/api2/v2/users/profile',
    getChatId: '/api2/v2/chats/getChatId'
};

// Основной обработчик сообщений от background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Content script получил сообщение:', message.type);
    
    handleMessage(message)
        .then(response => {
            console.log('✅ Ответ отправлен:', response);
            sendResponse(response);
        })
        .catch(error => {
            console.error('❌ Ошибка в content script:', error);
            sendResponse({ success: false, error: error.message });
        });
    
    return true;
});

// Обработчик сообщений
async function handleMessage(message) {
    switch (message.type) {
        case 'SCAN_FANS':
            return await scanFans();
            
        case 'SEND_MESSAGE':
            return await sendMessageAPI(message.data);
            
        case 'CHECK_PAGE':
            return await checkPageType();
            
        default:
            throw new Error(`Неизвестный тип сообщения: ${message.type}`);
    }
}

// БЕЗОПАСНАЯ инициализация API (только при необходимости)
async function initializeAPIWhenNeeded() {
    if (authToken) return true; // Уже инициализирован
    
    console.log('🔐 Инициализация API по требованию...');
    
    try {
        // Безопасно пытаемся найти токен
        authToken = await findAuthTokenSafely();
        userAgent = navigator.userAgent;
        
        if (authToken) {
            console.log('✅ API токен найден');
            return true;
        } else {
            console.log('ℹ️ API токен не найден, будем использовать DOM метод');
            return false;
        }
        
    } catch (error) {
        console.warn('⚠️ Не удалось найти API токен:', error.message);
        return false;
    }
}

// БЕЗОПАСНЫЙ поиск токена (не агрессивный)
async function findAuthTokenSafely() {
    try {
        // Сначала проверяем очевидные места
        let token = localStorage.getItem('auth_token') || 
                   sessionStorage.getItem('auth_token');
        
        if (token) return token;
        
        // Проверяем cookies только если localStorage пуст
        token = getCookieValue('auth_token') || getCookieValue('session_token');
        if (token) return token;
        
        // В крайнем случае - ищем в window объекте
        if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.auth) {
            return window.__INITIAL_STATE__.auth.token;
        }
        
        return null;
        
    } catch (error) {
        // Молча игнорируем ошибки - не хотим привлекать внимание
        return null;
    }
}

// Безопасное получение cookie
function getCookieValue(name) {
    try {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            return parts.pop().split(';').shift();
        }
        return null;
    } catch (error) {
        return null;
    }
}

// БЫСТРАЯ ОТПРАВКА через API (только когда нужно)
async function sendMessageAPI(messageData) {
    console.log('🚀 Попытка API отправки:', messageData.name);
    
    try {
        // Инициализируем API только сейчас
        const apiReady = await initializeAPIWhenNeeded();
        
        if (!apiReady) {
            console.log('🔄 API недоступен, переключение на DOM метод');
            return await sendMessageDOM(messageData);
        }
        
        // Получаем ID чата с пользователем
        const chatId = await getChatId(messageData.username);
        
        // Отправляем сообщение
        const response = await sendMessageDirectly(chatId, messageData.processedMessage);
        
        console.log('✅ Сообщение отправлено через API');
        
        return {
            success: true,
            recipient: messageData.username,
            message: messageData.processedMessage,
            method: 'API'
        };
        
    } catch (error) {
        console.log('🔄 API ошибка, переключение на DOM метод:', error.message);
        return await sendMessageDOM(messageData);
    }
}

// Получение ID чата
async function getChatId(username) {
    const response = await fetch('/api2/v2/chats/getChatId', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'User-Agent': userAgent,
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            username: username
        })
    });
    
    if (!response.ok) {
        throw new Error(`Не удалось получить chat ID: ${response.status}`);
    }
    
    const data = await response.json();
    return data.chatId || data.id;
}

// Прямая отправка сообщения
async function sendMessageDirectly(chatId, message) {
    const response = await fetch('/api2/v2/chats/sendMessage', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'User-Agent': userAgent,
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            chatId: chatId,
            message: message,
            type: 'text'
        })
    });
    
    if (!response.ok) {
        throw new Error(`Ошибка отправки: ${response.status}`);
    }
    
    return await response.json();
}

// Fallback DOM метод (безопасный)
async function sendMessageDOM(messageData) {
    console.log('🐌 DOM отправка сообщения:', messageData.name);
    
    try {
        // Находим фанта на странице
        const fanElement = await findFanElement(messageData.username);
        
        if (!fanElement) {
            throw new Error(`Фан ${messageData.username} не найден на странице`);
        }
        
        // Кликаем на кнопку сообщения
        const messageButton = fanElement.querySelector('a[href*="/my/chats/chat/"]');
        if (!messageButton) {
            throw new Error('Кнопка сообщения не найдена');
        }
        
        console.log('🖱️ Кликаем на кнопку сообщения...');
        messageButton.click();
        
        // Ждем загрузки страницы чата
        await waitForChatPage();
        
        // Отправляем сообщение
        await typeAndSendMessage(messageData.processedMessage);
        
        // Возвращаемся к списку фанатов
        window.history.back();
        await delay(1000);
        
        console.log('✅ Сообщение отправлено через DOM');
        
        return {
            success: true,
            recipient: messageData.username,
            message: messageData.processedMessage,
            method: 'DOM'
        };
        
    } catch (error) {
        console.error('❌ Ошибка DOM отправки:', error);
        throw error;
    }
}

// БЕЗОПАСНОЕ сканирование фанатов
async function scanFans() {
    console.log('🔍 Сканирование фанатов...');
    
    try {
        // Расширенная проверка URL страницы OnlyFans
        const url = window.location.href;
        const isValidPage = url.includes('/my/collections') || 
                           url.includes('/subscribers') || 
                           url.includes('/fans') ||
                           url.includes('onlyfans.com/my');
        
        if (!isValidPage) {
            throw new Error(`Неподдерживаемая страница: ${url}`);
        }
        
        console.log('✅ Страница подходит для сканирования');
        
        // Безопасная загрузка фанатов
        await loadAllFansSafely();
        
        // Извлекаем данные
        const fans = await extractFansData();
        
        console.log('👥 Найдено фанатов:', fans.length);
        
        if (fans.length === 0) {
            console.warn('⚠️ Фанаты не найдены, возможно нужно обновить селекторы');
        }
        
        // Отправляем данные в background script
        await chrome.runtime.sendMessage({
            type: 'FANS_FOUND',
            data: fans
        });
        
        return {
            success: true,
            fansCount: fans.length,
            onlineCount: fans.filter(f => f.isOnline).length
        };
        
    } catch (error) {
        console.error('❌ Ошибка сканирования:', error);
        throw error;
    }
}

// Безопасная загрузка всех фанатов
async function loadAllFansSafely() {
    console.log('⚡ Загрузка фанатов...');
    
    let lastCount = 0;
    let attempts = 0;
    const maxAttempts = 15; // Меньше попыток для безопасности
    
    while (attempts < maxAttempts) {
        const currentCount = document.querySelectorAll('.b-users__item.m-fans').length;
        
        if (currentCount > lastCount) {
            lastCount = currentCount;
            attempts = 0;
        } else {
            attempts++;
        }
        
        // Плавная прокрутка
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
        
        await delay(200); // Более длинная задержка для безопасности
        
        console.log(`📊 Загружено: ${currentCount}`);
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    console.log('✅ Загрузка завершена');
}

// Простое извлечение данных с улучшенными селекторами
async function extractFansData() {
    // Пробуем разные селекторы для фанатов
    const fanSelectors = [
        '.b-users__item.m-fans',
        '.b-users__item',
        '[data-user]',
        '.user-item',
        '.fan-item'
    ];
    
    let fanElements = [];
    
    for (const selector of fanSelectors) {
        fanElements = document.querySelectorAll(selector);
        if (fanElements.length > 0) {
            console.log(`✅ Найдены элементы с селектором: ${selector}`);
            break;
        }
    }
    
    if (fanElements.length === 0) {
        console.warn('⚠️ Элементы фанатов не найдены, проверьте селекторы');
        return [];
    }
    
    const fans = [];
    
    fanElements.forEach((fanElement, index) => {
        try {
            // Пробуем разные селекторы для имени
            const nameSelectors = [
                '[at-attr="custom_name"]',
                '.g-user-name',
                '.user-name',
                '.name',
                'h3',
                'h4'
            ];
            
            let nameElement = null;
            for (const selector of nameSelectors) {
                nameElement = fanElement.querySelector(selector);
                if (nameElement) break;
            }
            
            // Пробуем разные селекторы для username
            const usernameSelectors = [
                '[at-attr="user_link"] .g-user-username',
                '.g-user-username',
                '.username',
                '[href*="onlyfans.com/"]'
            ];
            
            let handleElement = null;
            for (const selector of usernameSelectors) {
                handleElement = fanElement.querySelector(selector);
                if (handleElement) break;
            }
            
            // Проверяем онлайн статус
            const onlineSelectors = [
                '.online_status_class.online',
                '.online',
                '.status-online',
                '[data-online="true"]'
            ];
            
            let isOnline = false;
            for (const selector of onlineSelectors) {
                if (fanElement.querySelector(selector)) {
                    isOnline = true;
                    break;
                }
            }
            
            const name = nameElement ? nameElement.textContent.trim() : `User${index + 1}`;
            let username = 'unknown';
            
            if (handleElement) {
                const text = handleElement.textContent.trim().replace('@', '');
                username = text || `user${index + 1}`;
            } else {
                // Пытаемся извлечь из href
                const linkElement = fanElement.querySelector('a[href*="onlyfans.com/"]');
                if (linkElement) {
                    const href = linkElement.getAttribute('href');
                    const match = href.match(/onlyfans\.com\/([^\/\?]+)/);
                    if (match) {
                        username = match[1];
                    }
                }
            }
            
            fans.push({
                name: name,
                username: username,
                isOnline: isOnline,
                recentlyOnline: false,
                avatarUrl: null,
                profileUrl: `https://onlyfans.com/${username}`,
                lastSeen: isOnline ? Date.now() : null
            });
            
        } catch (error) {
            console.warn(`⚠️ Ошибка обработки фаната ${index}:`, error);
        }
    });
    
    return fans;
}

// Вспомогательные функции
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function findFanElement(username) {
    // Пробуем найти фаната разными способами
    const fanSelectors = [
        '.b-users__item.m-fans',
        '.b-users__item', 
        '[data-user]',
        '.user-item'
    ];
    
    for (const selector of fanSelectors) {
        const fanElements = document.querySelectorAll(selector);
        
        for (const fanElement of fanElements) {
            // Пробуем разные способы найти username
            const usernameSelectors = [
                '[at-attr="user_link"] .g-user-username',
                '.g-user-username',
                '.username',
                'a[href*="onlyfans.com/"]'
            ];
            
            for (const usernameSelector of usernameSelectors) {
                const handleElement = fanElement.querySelector(usernameSelector);
                if (handleElement) {
                    let fanUsername = '';
                    
                    if (usernameSelector.includes('href')) {
                        // Извлекаем из href
                        const href = handleElement.getAttribute('href');
                        const match = href.match(/onlyfans\.com\/([^\/\?]+)/);
                        if (match) {
                            fanUsername = match[1];
                        }
                    } else {
                        // Извлекаем из текста
                        fanUsername = handleElement.textContent.trim().replace('@', '');
                    }
                    
                    if (fanUsername === username) {
                        console.log(`✅ Найден фан: ${username}`);
                        return fanElement;
                    }
                }
            }
        }
    }
    
    console.warn(`⚠️ Фан ${username} не найден на странице`);
    return null;
}

async function waitForChatPage() {
    console.log('⏳ Ожидание загрузки чата...');
    
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 20; // Больше попыток
        
        const checkInterval = setInterval(() => {
            attempts++;
            
            // Проверяем разные варианты URL чата
            const chatURLPatterns = [
                '/my/chats/chat/',
                '/chats/',
                '/messages/'
            ];
            
            const isChatPage = chatURLPatterns.some(pattern => 
                window.location.href.includes(pattern)
            );
            
            if (isChatPage) {
                // Пробуем разные селекторы для поля ввода
                const inputSelectors = [
                    '.b-chat__message-form textarea',
                    'textarea[placeholder*="message"]',
                    'textarea[placeholder*="сообщение"]',
                    '.message-input',
                    'textarea'
                ];
                
                for (const selector of inputSelectors) {
                    const messageForm = document.querySelector(selector);
                    if (messageForm && messageForm.offsetParent !== null) {
                        clearInterval(checkInterval);
                        console.log(`✅ Чат загружен, найдено поле: ${selector}`);
                        resolve();
                        return;
                    }
                }
            }
            
            if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                console.error('❌ Тайм-аут загрузки чата');
                reject(new Error('Тайм-аут загрузки чата'));
            }
        }, 500); // Проверяем каждые 500ms
    });
}

async function typeAndSendMessage(message) {
    console.log('⌨️ Отправка сообщения:', message);
    
    // Пробуем разные селекторы для поля ввода
    const inputSelectors = [
        '.b-chat__message-form textarea',
        'textarea[placeholder*="message"]',
        'textarea[placeholder*="сообщение"]', 
        '.message-input',
        'textarea'
    ];
    
    let messageInput = null;
    for (const selector of inputSelectors) {
        messageInput = document.querySelector(selector);
        if (messageInput && messageInput.offsetParent !== null) {
            console.log(`✅ Найдено поле ввода: ${selector}`);
            break;
        }
    }
    
    if (!messageInput) {
        throw new Error('Поле ввода сообщения не найдено');
    }
    
    // Пробуем разные селекторы для кнопки отправки
    const buttonSelectors = [
        '.b-chat__message-form [type="submit"]',
        'button[type="submit"]',
        '.send-button',
        'button[aria-label*="send"]',
        'button[aria-label*="отправить"]'
    ];
    
    let sendButton = null;
    for (const selector of buttonSelectors) {
        sendButton = document.querySelector(selector);
        if (sendButton && sendButton.offsetParent !== null) {
            console.log(`✅ Найдена кнопка отправки: ${selector}`);
            break;
        }
    }
    
    if (!sendButton) {
        throw new Error('Кнопка отправки не найдена');
    }
    
    // Отправляем сообщение
    messageInput.focus();
    messageInput.value = message;
    messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    messageInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    await delay(500);
    sendButton.click();
    await delay(1000);
    
    console.log('✅ Сообщение отправлено');
}

async function checkPageType() {
    const url = window.location.href;
    const isFansPage = url.includes('/collections/user-lists/subscribers');
    
    return {
        success: true,
        pageType: isFansPage ? 'fans' : 'other',
        url: url
    };
}

// БЕЗОПАСНАЯ инициализация
async function initialize() {
    console.log('🚀 OnlyFans Manager Pro готов к работе');
    
    // НЕ ИЗВЛЕКАЕМ ТОКЕНЫ ПРИ ИНИЦИАЛИЗАЦИИ!
    // Только сообщаем что готовы к работе
    
    if (window.location.href.includes('/collections/user-lists/subscribers')) {
        chrome.runtime.sendMessage({
            type: 'CONTENT_READY',
            data: { pageType: 'fans' }
        }).catch(() => {});
    }
    
    isInitialized = true;
}

// Безопасный запуск
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    // Небольшая задержка чтобы не привлекать внимание
    setTimeout(initialize, 1000);
} 
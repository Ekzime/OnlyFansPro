// Content Script для OnlyFans Manager Pro
// Парсер фанатов и автоматизация сообщений

console.log('🎯 OnlyFans Manager Pro - Content script активирован');

// Глобальные переменные
let lastScanTime = 0;
let scanInProgress = false;
let observerActive = false;
let retryAttempts = 0;
const MAX_RETRY_ATTEMPTS = 3;

// Настройки для работы с DOM
const SELECTORS = {
    // Контейнеры фанатов
    fanContainer: '.b-fans__container',
    fanItems: '.b-users__item.m-fans',
    
    // Информация о пользователе
    userAvatar: '.g-avatar',
    userName: '[at-attr="custom_name"]',
    userHandle: '[at-attr="user_link"] .g-user-username',
    onlineStatus: '.online_status_class.online',
    
    // Кнопки и ссылки
    messageButton: 'a[href*="/my/chats/chat/"]',
    userProfileLink: 'a[href*="onlyfans.com/"][href*="/my/chats/chat/"]:not([href*="/my/chats/chat/"])',
    
    // Модальные окна и текстовые поля
    messageModal: '.b-chat__message-form',
    messageInput: '.b-chat__message-form textarea',
    sendButton: '.b-chat__message-form [type="submit"]',
    
    // Индикаторы загрузки
    loadingIndicator: '.infinite-loading-container'
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
    
    return true; // Для асинхронного ответа
});

// Обработчик сообщений
async function handleMessage(message) {
    switch (message.type) {
        case 'SCAN_FANS':
            return await scanFans();
            
        case 'SEND_MESSAGE':
            return await sendMessageToFan(message.data);
            
        case 'CHECK_PAGE':
            return await checkPageType();
            
        default:
            throw new Error(`Неизвестный тип сообщения: ${message.type}`);
    }
}

// Проверка типа страницы
async function checkPageType() {
    const url = window.location.href;
    const isFansPage = url.includes('/collections/user-lists/subscribers');
    const isChatPage = url.includes('/my/chats');
    
    return {
        success: true,
        pageType: isFansPage ? 'fans' : isChatPage ? 'chat' : 'other',
        url: url
    };
}

// Основная функция сканирования фанатов
async function scanFans() {
    console.log('🔍 Начинаем сканирование фанатов...');
    
    if (scanInProgress) {
        console.log('⏳ Сканирование уже в процессе');
        return { success: false, error: 'Сканирование уже выполняется' };
    }
    
    scanInProgress = true;
    
    try {
        // Проверяем, что мы на правильной странице
        if (!window.location.href.includes('/collections/user-lists/subscribers')) {
            throw new Error('Не находимся на странице фанатов');
        }
        
        // Ждем загрузки страницы
        await waitForPageLoad();
        
        // Прокручиваем страницу для загрузки всех фанатов
        await scrollToLoadAllFans();
        
        // Получаем список фанатов
        const fans = await extractFansData();
        
        console.log('👥 Найдено фанатов:', fans.length);
        
        // Отправляем данные в background script
        await chrome.runtime.sendMessage({
            type: 'FANS_FOUND',
            data: fans
        });
        
        lastScanTime = Date.now();
        retryAttempts = 0;
        
        return {
            success: true,
            fansCount: fans.length,
            onlineCount: fans.filter(f => f.isOnline).length
        };
        
    } catch (error) {
        console.error('❌ Ошибка сканирования:', error);
        retryAttempts++;
        
        if (retryAttempts < MAX_RETRY_ATTEMPTS) {
            console.log(`🔄 Повторная попытка ${retryAttempts}/${MAX_RETRY_ATTEMPTS}`);
            await delay(2000);
            return await scanFans();
        }
        
        throw error;
    } finally {
        scanInProgress = false;
    }
}

// Ожидание загрузки страницы
async function waitForPageLoad() {
    console.log('⏳ Ожидание загрузки страницы...');
    
    return new Promise((resolve, reject) => {
        const checkLoaded = () => {
            const container = document.querySelector(SELECTORS.fanContainer);
            if (container && document.querySelectorAll(SELECTORS.fanItems).length > 0) {
                console.log('✅ Страница загружена');
                resolve();
            } else {
                setTimeout(checkLoaded, 500);
            }
        };
        
        checkLoaded();
        
        // Таймаут на случай если страница не загрузится
        setTimeout(() => {
            reject(new Error('Тайм-аут загрузки страницы'));
        }, 15000);
    });
}

// Прокрутка для загрузки всех фанатов
async function scrollToLoadAllFans() {
    console.log('📜 Прокручиваем для загрузки всех фанатов...');
    
    let lastCount = 0;
    let stableCount = 0;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (stableCount < 3 && attempts < maxAttempts) {
        const currentCount = document.querySelectorAll(SELECTORS.fanItems).length;
        
        if (currentCount === lastCount) {
            stableCount++;
        } else {
            stableCount = 0;
            lastCount = currentCount;
        }
        
        // Прокручиваем вниз
        window.scrollTo(0, document.body.scrollHeight);
        
        // Ждем загрузки новых элементов
        await delay(1000);
        
        attempts++;
        console.log(`📊 Загружено фанатов: ${currentCount}, попытка: ${attempts}/${maxAttempts}`);
    }
    
    // Возвращаемся в начало страницы
    window.scrollTo(0, 0);
    await delay(500);
    
    console.log('✅ Загрузка фанатов завершена');
}

// Извлечение данных фанатов
async function extractFansData() {
    console.log('📋 Извлекаем данные фанатов...');
    
    const fanElements = document.querySelectorAll(SELECTORS.fanItems);
    const fans = [];
    
    for (let i = 0; i < fanElements.length; i++) {
        try {
            const fanElement = fanElements[i];
            const fanData = await extractSingleFanData(fanElement);
            
            if (fanData) {
                fans.push(fanData);
            }
        } catch (error) {
            console.warn('⚠️ Ошибка извлечения данных фаната:', error);
        }
    }
    
    return fans;
}

// Извлечение данных одного фаната
async function extractSingleFanData(fanElement) {
    const nameElement = fanElement.querySelector(SELECTORS.userName);
    const handleElement = fanElement.querySelector(SELECTORS.userHandle);
    const avatarElement = fanElement.querySelector(SELECTORS.userAvatar);
    const isOnline = fanElement.querySelector(SELECTORS.onlineStatus) !== null;
    
    // Извлекаем имя
    const name = nameElement ? nameElement.textContent.trim() : 'Unknown';
    
    // Извлекаем username (убираем @)
    let username = 'unknown';
    if (handleElement) {
        username = handleElement.textContent.trim().replace('@', '');
    } else {
        // Пытаемся извлечь из ссылки на профиль
        const profileLink = fanElement.querySelector('a[href*="onlyfans.com/"]');
        if (profileLink) {
            const href = profileLink.getAttribute('href');
            const match = href.match(/onlyfans\.com\/([^\/\?]+)/);
            if (match) {
                username = match[1];
            }
        }
    }
    
    // Извлекаем URL аватара
    let avatarUrl = null;
    if (avatarElement) {
        const imgElement = avatarElement.querySelector('img');
        if (imgElement) {
            avatarUrl = imgElement.getAttribute('src');
        }
    }
    
    // Проверяем недавнюю активность (если есть индикаторы)
    const recentlyOnline = checkRecentActivity(fanElement);
    
    return {
        name: name,
        username: username,
        isOnline: isOnline,
        recentlyOnline: recentlyOnline,
        avatarUrl: avatarUrl,
        profileUrl: `https://onlyfans.com/${username}`,
        lastSeen: isOnline ? Date.now() : null
    };
}

// Проверка недавней активности (эвристика)
function checkRecentActivity(fanElement) {
    // Логика для определения недавней активности
    // Можно расширить на основе дополнительных индикаторов в DOM
    const hasRecentIndicators = fanElement.querySelector('.recent-activity') !== null;
    return hasRecentIndicators;
}

// Отправка сообщения фанату
async function sendMessageToFan(messageData) {
    console.log('💌 Отправляем сообщение фанату:', messageData.name);
    
    try {
        // Находим фанта на странице
        const fanElement = await findFanElement(messageData.username);
        
        if (!fanElement) {
            throw new Error(`Фан ${messageData.username} не найден на странице`);
        }
        
        // Кликаем на кнопку сообщения
        const messageButton = fanElement.querySelector(SELECTORS.messageButton);
        if (!messageButton) {
            throw new Error('Кнопка сообщения не найдена');
        }
        
        console.log('🖱️ Кликаем на кнопку сообщения...');
        messageButton.click();
        
        // Ждем загрузки страницы чата
        await waitForChatPage();
        
        // Отправляем сообщение
        await typeAndSendMessage(messageData.processedMessage);
        
        console.log('✅ Сообщение отправлено успешно');
        
        return {
            success: true,
            recipient: messageData.username,
            message: messageData.processedMessage
        };
        
    } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error);
        throw error;
    }
}

// Поиск элемента фаната на странице
async function findFanElement(username) {
    const fanElements = document.querySelectorAll(SELECTORS.fanItems);
    
    for (const fanElement of fanElements) {
        const handleElement = fanElement.querySelector(SELECTORS.userHandle);
        if (handleElement) {
            const fanUsername = handleElement.textContent.trim().replace('@', '');
            if (fanUsername === username) {
                return fanElement;
            }
        }
    }
    
    return null;
}

// Ожидание загрузки страницы чата
async function waitForChatPage() {
    console.log('⏳ Ожидание загрузки чата...');
    
    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
            if (window.location.href.includes('/my/chats/chat/')) {
                const messageForm = document.querySelector(SELECTORS.messageInput);
                if (messageForm) {
                    clearInterval(checkInterval);
                    console.log('✅ Страница чата загружена');
                    resolve();
                }
            }
        }, 500);
        
        setTimeout(() => {
            clearInterval(checkInterval);
            reject(new Error('Тайм-аут загрузки чата'));
        }, 10000);
    });
}

// Ввод и отправка сообщения
async function typeAndSendMessage(message) {
    console.log('⌨️ Вводим сообщение:', message);
    
    // Находим поле ввода
    const messageInput = document.querySelector(SELECTORS.messageInput);
    if (!messageInput) {
        throw new Error('Поле ввода сообщения не найдено');
    }
    
    // Имитируем ввод текста
    messageInput.focus();
    messageInput.value = message;
    
    // Генерируем события клавиатуры
    messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    messageInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    await delay(500);
    
    // Находим и кликаем кнопку отправки
    const sendButton = document.querySelector(SELECTORS.sendButton);
    if (!sendButton) {
        throw new Error('Кнопка отправки не найдена');
    }
    
    console.log('📤 Нажимаем кнопку отправки...');
    sendButton.click();
    
    // Ждем отправки
    await delay(1000);
    
    // Проверяем, что сообщение отправлено (поле очистилось)
    if (messageInput.value !== '') {
        throw new Error('Сообщение не было отправлено');
    }
    
    console.log('✅ Сообщение отправлено');
}

// Наблюдатель за изменениями DOM
function startDOMObserver() {
    if (observerActive) return;
    
    console.log('👀 Запускаем наблюдатель DOM...');
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                // Проверяем появление новых фанатов
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const newFans = node.querySelectorAll && node.querySelectorAll(SELECTORS.fanItems);
                        if (newFans && newFans.length > 0) {
                            console.log('👥 Обнаружены новые фанаты:', newFans.length);
                            // Можно добавить логику для обработки новых фанатов
                        }
                    }
                });
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    observerActive = true;
}

// Утилитарные функции
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay(min = 500, max = 2000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Имитация человеческого поведения
async function humanDelay() {
    const delayTime = getRandomDelay(800, 2500);
    console.log(`⏰ Пауза для имитации человеческого поведения: ${delayTime}ms`);
    await delay(delayTime);
}

// Проверка анти-бот защиты
function checkForAntiBot() {
    const suspiciousElements = [
        'captcha',
        'recaptcha',
        'cloudflare',
        'bot-detection',
        'anti-bot'
    ];
    
    for (const element of suspiciousElements) {
        if (document.querySelector(`[class*="${element}"], [id*="${element}"]`)) {
            console.warn('⚠️ Обнаружены элементы анти-бот защиты');
            return true;
        }
    }
    
    return false;
}

// Инициализация content script
function initialize() {
    console.log('🚀 Инициализация OnlyFans Manager Pro content script');
    
    // Проверяем страницу
    const pageType = window.location.href.includes('/collections/user-lists/subscribers') ? 'fans' : 'other';
    console.log('📄 Тип страницы:', pageType);
    
    if (pageType === 'fans') {
        // Запускаем наблюдатель для страницы фанатов
        startDOMObserver();
        
        // Уведомляем background script о готовности
        chrome.runtime.sendMessage({
            type: 'CONTENT_READY',
            data: { pageType: 'fans' }
        }).catch(() => {
            // Background script может быть не готов - игнорируем
        });
    }
}

// Запускаем инициализацию после загрузки страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// Дополнительная проверка через 2 секунды
setTimeout(() => {
    if (!observerActive && window.location.href.includes('/collections/user-lists/subscribers')) {
        console.log('🔄 Повторная инициализация...');
        initialize();
    }
}, 2000); 
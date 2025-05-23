// Background Service Worker для OnlyFans Manager Pro
// Центральный мозг системы - планировщик и менеджер данных

console.log('🚀 OnlyFans Manager Pro - Background script загружен');

// Глобальные переменные
let schedulerTimer = null;
let isInitialized = false;

// Обработка установки расширения
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('📦 Расширение установлено:', details.reason);
    await initializeExtension();
});

// Обработка запуска расширения
chrome.runtime.onStartup.addListener(async () => {
    console.log('🔄 Расширение запущено');
    await initializeExtension();
});

// Инициализация расширения
async function initializeExtension() {
    if (isInitialized) return;
    
    console.log('⚙️ Инициализация расширения...');
    
    // Инициализация настроек по умолчанию
    const defaultData = {
        settings: {
            interval: 1200, // секунд (20 минут)
            workingHours: {
                start: '10:00',
                end: '22:00'
            },
            onlineOnly: true,
            randomDelay: false,
            messageTemplate: "Привет, {name}! Как дела? 😊"
        },
        stats: {
            sentToday: 0,
            totalSent: 0,
            onlineFans: 0,
            queueSize: 0,
            lastReset: new Date().toISOString().split('T')[0]
        },
        queue: [],
        messageHistory: [],
        runtime: {
            isRunning: false,
            isPaused: false,
            lastActivity: Date.now(),
            nextScheduled: null,
            currentFanId: null
        }
    };

    // Проверяем существующие данные
    const existingData = await chrome.storage.local.get(Object.keys(defaultData));
    
    // Заполняем недостающие поля
    for (const [key, value] of Object.entries(defaultData)) {
        if (!existingData[key]) {
            await chrome.storage.local.set({ [key]: value });
        }
    }

    // Проверяем, нужно ли сбросить ежедневную статистику
    await checkDailyReset();
    
    // Запускаем основной планировщик
    startMainScheduler();
    
    isInitialized = true;
    console.log('✅ Инициализация завершена');
}

// Проверка и сброс ежедневной статистики
async function checkDailyReset() {
    const data = await chrome.storage.local.get(['stats']);
    const stats = data.stats || {};
    const today = new Date().toISOString().split('T')[0];
    
    if (stats.lastReset !== today) {
        console.log('📅 Сброс ежедневной статистики');
        stats.sentToday = 0;
        stats.lastReset = today;
        await chrome.storage.local.set({ stats });
    }
}

// Основной планировщик (проверяет каждые 10 секунд)
function startMainScheduler() {
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
    }
    
    schedulerTimer = setInterval(async () => {
        try {
            await processScheduler();
        } catch (error) {
            console.error('❌ Ошибка в планировщике:', error);
        }
    }, 10000); // Каждые 10 секунд
    
    console.log('⏰ Основной планировщик запущен');
}

// Обработка планировщика
async function processScheduler() {
    const data = await chrome.storage.local.get(['runtime', 'queue', 'settings']);
    const { runtime, queue, settings } = data;
    
    if (!runtime?.isRunning || runtime?.isPaused) {
        return; // Не активны
    }
    
    const now = Date.now();
    
    // Проверяем рабочие часы
    if (!isWithinWorkingHours(settings?.workingHours)) {
        console.log('😴 Вне рабочих часов');
        return;
    }
    
    // Ищем сообщения готовые к отправке
    const readyMessages = queue?.filter(item => 
        item.scheduledTime <= now && 
        item.status !== 'sending'
    ) || [];
    
    if (readyMessages.length > 0) {
        const nextMessage = readyMessages[0];
        console.log('📨 Готово к отправке:', nextMessage);
        await sendMessage(nextMessage);
    }
    
    // Обновляем время следующей отправки
    await updateNextScheduledTime();
}

// Проверка рабочих часов
function isWithinWorkingHours(workingHours) {
    if (!workingHours) return true;
    
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = workingHours.start.split(':').map(Number);
    const [endHour, endMin] = workingHours.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;
    
    return currentTime >= startTime && currentTime <= endTime;
}

// Отправка сообщения
async function sendMessage(messageItem) {
    console.log('🚀 Начинаем отправку сообщения:', messageItem);
    
    // Обновляем статус на "отправляется"
    await updateQueueItemStatus(messageItem.id, 'sending');
    
    try {
        // Получаем активную вкладку OnlyFans
        const tabs = await chrome.tabs.query({
            url: "https://onlyfans.com/*"
        });
        
        if (tabs.length === 0) {
            throw new Error('Не найдена открытая вкладка OnlyFans');
        }
        
        const targetTab = tabs[0];
        
        // Отправляем команду content script
        const response = await chrome.tabs.sendMessage(targetTab.id, {
            type: 'SEND_MESSAGE',
            data: messageItem
        });
        
        if (response?.success) {
            await handleMessageSent(messageItem);
        } else {
            throw new Error(response?.error || 'Неизвестная ошибка отправки');
        }
        
    } catch (error) {
        console.error('❌ Ошибка отправки:', error);
        await handleMessageError(messageItem, error.message);
    }
}

// Обработка успешной отправки
async function handleMessageSent(messageItem) {
    console.log('✅ Сообщение отправлено:', messageItem);
    
    // Добавляем в историю
    const historyItem = {
        id: 'msg_' + Date.now(),
        recipient: messageItem.username,
        recipientName: messageItem.name,
        message: messageItem.processedMessage,
        timestamp: Date.now(),
        status: 'sent',
        retryCount: messageItem.retryCount || 0
    };
    
    await addToHistory(historyItem);
    
    // Удаляем из очереди
    await removeFromQueue(messageItem.id);
    
    // Обновляем статистику
    await updateStats({
        sentToday: (await getStats()).sentToday + 1,
        totalSent: (await getStats()).totalSent + 1
    });
    
    // Планируем следующее сообщение
    await scheduleNextMessage();
    
    // Уведомляем popup
    notifyPopup('MESSAGE_SENT', {
        fanName: messageItem.name,
        success: true
    });
}

// Обработка ошибки отправки
async function handleMessageError(messageItem, errorMessage) {
    console.log('⚠️ Ошибка отправки:', errorMessage);
    
    messageItem.retryCount = (messageItem.retryCount || 0) + 1;
    
    if (messageItem.retryCount < 3) {
        // Повторная попытка через 5 минут
        messageItem.scheduledTime = Date.now() + (5 * 60 * 1000);
        messageItem.status = 'pending';
        await updateQueueItem(messageItem);
        
        console.log('🔄 Запланирована повторная попытка для:', messageItem.name);
    } else {
        // Слишком много попыток - помечаем как failed
        const historyItem = {
            id: 'msg_' + Date.now(),
            recipient: messageItem.username,
            recipientName: messageItem.name,
            message: messageItem.processedMessage,
            timestamp: Date.now(),
            status: 'failed',
            retryCount: messageItem.retryCount,
            error: errorMessage
        };
        
        await addToHistory(historyItem);
        await removeFromQueue(messageItem.id);
        
        console.log('❌ Сообщение помечено как неудачное:', messageItem.name);
    }
}

// Планирование следующего сообщения
async function scheduleNextMessage() {
    const data = await chrome.storage.local.get(['queue', 'settings']);
    const { queue, settings } = data;
    
    if (!queue || queue.length === 0) {
        console.log('📭 Очередь пуста');
        return;
    }
    
    const interval = settings?.interval || 1200; // секунды
    const randomDelay = settings?.randomDelay;
    
    let nextTime = Date.now() + (interval * 1000);
    
    // Добавляем случайную задержку ±20%
    if (randomDelay) {
        const variation = interval * 0.2; // 20%
        const randomOffset = (Math.random() - 0.5) * 2 * variation;
        nextTime += randomOffset * 1000;
    }
    
    // Находим следующее сообщение в очереди
    const nextMessage = queue.find(item => item.status === 'pending');
    if (nextMessage && nextMessage.scheduledTime > nextTime) {
        nextMessage.scheduledTime = nextTime;
        await updateQueueItem(nextMessage);
    }
    
    console.log('⏰ Следующее сообщение запланировано на:', new Date(nextTime));
}

// Обработка сообщений от popup и content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Получено сообщение:', message.type);
    
    handleMessage(message, sender)
        .then(response => sendResponse(response))
        .catch(error => {
            console.error('❌ Ошибка обработки сообщения:', error);
            sendResponse({ success: false, error: error.message });
        });
    
    return true; // Для асинхронного ответа
});

// Асинхронный обработчик сообщений
async function handleMessage(message, sender) {
    switch (message.type) {
        case 'GET_STATUS':
            return await getStatus();
            
        case 'START_MESSAGING':
            return await startMessaging(message.data);
            
        case 'PAUSE_MESSAGING':
            return await pauseMessaging();
            
        case 'STOP_MESSAGING':
            return await stopMessaging();
            
        case 'FANS_FOUND':
            return await processFansData(message.data);
            
        case 'MESSAGE_SENT':
            // Уже обработано в handleMessageSent
            return { success: true };
            
        case 'GET_MESSAGE_HISTORY':
            return await getMessageHistory(message.limit);
            
        default:
            throw new Error(`Неизвестный тип сообщения: ${message.type}`);
    }
}

// Получение статуса
async function getStatus() {
    const data = await chrome.storage.local.get(['runtime', 'stats', 'queue']);
    return {
        isRunning: data.runtime?.isRunning || false,
        isPaused: data.runtime?.isPaused || false,
        stats: data.stats || {},
        queueSize: data.queue?.length || 0,
        nextScheduled: data.runtime?.nextScheduled
    };
}

// Запуск рассылки
async function startMessaging(settings) {
    console.log('🚀 Запуск рассылки с настройками:', settings);
    
    // Сохраняем настройки
    await chrome.storage.local.set({ settings });
    
    // Обновляем runtime состояние
    const runtime = {
        isRunning: true,
        isPaused: false,
        lastActivity: Date.now(),
        nextScheduled: null,
        currentFanId: null
    };
    
    await chrome.storage.local.set({ runtime });
    
    // Запрашиваем сканирование фанатов
    await requestFansScan();
    
    return { success: true, message: 'Рассылка запущена' };
}

// Запрос сканирования фанатов
async function requestFansScan() {
    try {
        const tabs = await chrome.tabs.query({
            url: "https://onlyfans.com/*"
        });
        
        if (tabs.length > 0) {
            await chrome.tabs.sendMessage(tabs[0].id, {
                type: 'SCAN_FANS'
            });
        }
    } catch (error) {
        console.log('⚠️ Не удалось запросить сканирование фанатов:', error.message);
    }
}

// Пауза рассылки
async function pauseMessaging() {
    const runtime = await getRuntimeData();
    runtime.isPaused = true;
    await chrome.storage.local.set({ runtime });
    
    console.log('⏸️ Рассылка приостановлена');
    return { success: true, message: 'Рассылка приостановлена' };
}

// Остановка рассылки
async function stopMessaging() {
    const runtime = await getRuntimeData();
    runtime.isRunning = false;
    runtime.isPaused = false;
    runtime.nextScheduled = null;
    runtime.currentFanId = null;
    
    await chrome.storage.local.set({ runtime });
    
    // Очищаем очередь
    await chrome.storage.local.set({ queue: [] });
    
    console.log('⏹️ Рассылка остановлена');
    return { success: true, message: 'Рассылка остановлена' };
}

// Обработка данных фанатов
async function processFansData(fans) {
    console.log('👥 Обработка данных фанатов:', fans.length);
    
    const data = await chrome.storage.local.get(['settings', 'queue']);
    const { settings, queue } = data;
    
    // Фильтруем фанатов
    let filteredFans = fans;
    if (settings?.onlineOnly) {
        filteredFans = fans.filter(fan => fan.isOnline);
    }
    
    // Создаем новую очередь
    const newQueue = [];
    const now = Date.now();
    const interval = (settings?.interval || 1200) * 1000;
    
    filteredFans.forEach((fan, index) => {
        const queueItem = {
            id: 'fan_' + Date.now() + '_' + index,
            name: fan.name,
            username: fan.username,
            isOnline: fan.isOnline,
            priority: fan.isOnline ? 1 : (fan.recentlyOnline ? 2 : 3),
            scheduledTime: now + (interval * index), // Распределяем по времени
            status: 'pending',
            retryCount: 0,
            originalMessage: settings?.messageTemplate || "Привет, {name}!",
            processedMessage: processMessageTemplate(settings?.messageTemplate || "Привет, {name}!", fan)
        };
        
        newQueue.push(queueItem);
    });
    
    // Сортируем по приоритету и времени
    newQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        return a.scheduledTime - b.scheduledTime;
    });
    
    await chrome.storage.local.set({ queue: newQueue });
    
    // Обновляем статистику
    await updateStats({
        onlineFans: fans.filter(f => f.isOnline).length,
        queueSize: newQueue.length
    });
    
    console.log('✅ Очередь создана:', newQueue.length, 'сообщений');
    
    return { success: true, queueSize: newQueue.length };
}

// Обработка шаблона сообщения
function processMessageTemplate(template, fan) {
    const timeOfDay = getTimeOfDay();
    const randomEmoji = getRandomEmoji();
    
    return template
        .replace(/{name}/g, fan.name)
        .replace(/{time}/g, timeOfDay)
        .replace(/{emoji}/g, randomEmoji);
}

// Получение времени суток
function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour < 12) return 'утро';
    if (hour < 18) return 'день';
    return 'вечер';
}

// Случайный эмодзи
function getRandomEmoji() {
    const emojis = ['😊', '😘', '💕', '🥰', '😍', '💖', '✨', '🌟'];
    return emojis[Math.floor(Math.random() * emojis.length)];
}

// Вспомогательные функции для работы с данными
async function getRuntimeData() {
    const data = await chrome.storage.local.get(['runtime']);
    return data.runtime || {};
}

async function getStats() {
    const data = await chrome.storage.local.get(['stats']);
    return data.stats || {};
}

async function updateStats(updates) {
    const currentStats = await getStats();
    const updatedStats = { ...currentStats, ...updates };
    await chrome.storage.local.set({ stats: updatedStats });
}

async function updateQueueItemStatus(itemId, status) {
    const data = await chrome.storage.local.get(['queue']);
    const queue = data.queue || [];
    
    const itemIndex = queue.findIndex(item => item.id === itemId);
    if (itemIndex !== -1) {
        queue[itemIndex].status = status;
        await chrome.storage.local.set({ queue });
    }
}

async function updateQueueItem(updatedItem) {
    const data = await chrome.storage.local.get(['queue']);
    const queue = data.queue || [];
    
    const itemIndex = queue.findIndex(item => item.id === updatedItem.id);
    if (itemIndex !== -1) {
        queue[itemIndex] = { ...queue[itemIndex], ...updatedItem };
        await chrome.storage.local.set({ queue });
    }
}

async function removeFromQueue(itemId) {
    const data = await chrome.storage.local.get(['queue']);
    const queue = data.queue || [];
    
    const filteredQueue = queue.filter(item => item.id !== itemId);
    await chrome.storage.local.set({ queue: filteredQueue });
}

async function addToHistory(historyItem) {
    const data = await chrome.storage.local.get(['messageHistory']);
    const history = data.messageHistory || [];
    
    history.unshift(historyItem);
    
    // Ограничиваем историю до 1000 записей
    if (history.length > 1000) {
        history.splice(1000);
    }
    
    await chrome.storage.local.set({ messageHistory: history });
}

async function getMessageHistory(limit = 50) {
    const data = await chrome.storage.local.get(['messageHistory']);
    const history = data.messageHistory || [];
    return { history: history.slice(0, limit) };
}

async function updateNextScheduledTime() {
    const data = await chrome.storage.local.get(['queue', 'runtime']);
    const { queue, runtime } = data;
    
    const nextMessage = queue?.find(item => item.status === 'pending');
    const nextScheduled = nextMessage ? nextMessage.scheduledTime : null;
    
    if (runtime) {
        runtime.nextScheduled = nextScheduled;
        await chrome.storage.local.set({ runtime });
    }
}

// Уведомление popup
function notifyPopup(type, data) {
    chrome.runtime.sendMessage({
        type,
        data
    }).catch(() => {
        // Popup может быть закрыт - игнорируем ошибку
    });
}

// Инициализация при загрузке
if (!isInitialized) {
    initializeExtension();
} 
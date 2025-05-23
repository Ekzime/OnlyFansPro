// Background Service Worker для OnlyFans Manager Pro
// Обрабатывает фоновые задачи и планирование

console.log('OnlyFans Manager Pro - Background script загружен');

// Обработка установки расширения
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Расширение установлено:', details.reason);
    
    // Инициализация настроек по умолчанию
    chrome.storage.local.set({
        settings: {
            interval: 20, // минут
            workingHours: {
                start: '10:00',
                end: '22:00'
            },
            onlineOnly: true,
            randomDelay: false
        },
        stats: {
            sentToday: 0,
            totalSent: 0,
            onlineFans: 0,
            queueSize: 0
        },
        queue: [],
        isRunning: false
    });
});

// Обработка сообщений от popup и content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Получено сообщение:', message);
    
    switch (message.type) {
        case 'GET_STATUS':
            // Возвращаем текущий статус
            chrome.storage.local.get(['isRunning', 'stats'], (data) => {
                sendResponse({
                    isRunning: data.isRunning || false,
                    stats: data.stats || {}
                });
            });
            return true; // Для асинхронного ответа
            
        case 'START_MESSAGING':
            // Запуск процесса рассылки
            console.log('Запуск рассылки сообщений');
            startMessaging(message.data);
            sendResponse({ success: true });
            break;
            
        case 'STOP_MESSAGING':
            // Остановка процесса
            console.log('Остановка рассылки');
            stopMessaging();
            sendResponse({ success: true });
            break;
            
        case 'UPDATE_STATS':
            // Обновление статистики
            updateStats(message.data);
            break;
    }
});

// Функция запуска рассылки (заглушка)
function startMessaging(settings) {
    chrome.storage.local.set({ isRunning: true });
    
    // TODO: Реализовать логику планировщика
    console.log('Рассылка запущена с настройками:', settings);
}

// Функция остановки рассылки (заглушка)
function stopMessaging() {
    chrome.storage.local.set({ isRunning: false });
    console.log('Рассылка остановлена');
}

// Функция обновления статистики (заглушка)
function updateStats(stats) {
    chrome.storage.local.get(['stats'], (data) => {
        const currentStats = data.stats || {};
        const updatedStats = { ...currentStats, ...stats };
        
        chrome.storage.local.set({ stats: updatedStats });
        console.log('Статистика обновлена:', updatedStats);
    });
}

// Периодическая проверка планировщика (каждую минуту)
chrome.alarms.create('scheduler', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'scheduler') {
        // TODO: Проверить очередь и отправить сообщения при необходимости
        console.log('Проверка планировщика');
    }
}); 
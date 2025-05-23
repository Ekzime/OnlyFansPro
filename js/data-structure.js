// Пример структуры данных в chrome.storage.local

const extensionData = {
    // Настройки пользователя
    settings: {
        interval: 1200,           // секунды
        workingHours: {
            start: '10:00',
            end: '22:00'
        },
        onlineOnly: true,
        randomDelay: false,
        messageTemplate: "Привет, {name}! Как дела?"
    },

    // Текущая статистика
    stats: {
        sentToday: 15,
        totalSent: 234,
        onlineFans: 8,
        queueSize: 12,
        lastReset: "2024-01-15"   // для обнуления ежедневной статистики
    },

    // Очередь сообщений
    queue: [
        {
            id: 'fan_1',
            name: 'TestUser1',
            username: '@testuser1',
            isOnline: true,
            priority: 1,              // 1=онлайн, 2=недавно, 3=офлайн
            scheduledTime: 1704567600, // timestamp когда отправить
            retryCount: 0
        }
    ],

    // История отправленных сообщений
    messageHistory: [
        {
            id: 'msg_001',
            recipient: '@testuser1',
            recipientName: 'TestUser1',
            message: 'Привет, TestUser1! Как дела?',
            timestamp: 1704567600000,
            status: 'sent',           // sent, failed, pending
            retryCount: 0,
            response: null            // ответ фаната (если был)
        }
    ],

    // Состояние работы
    runtime: {
        isRunning: false,
        isPaused: false,
        lastActivity: 1704567600000,
        nextScheduled: 1704567900000,
        currentFanId: null
    }
};

// Функции для работы с данными
class DataManager {
    
    // Сохранение истории сообщения
    static async saveMessage(messageData) {
        const data = await chrome.storage.local.get(['messageHistory']);
        const history = data.messageHistory || [];
        
        history.unshift(messageData); // Добавляем в начало
        
        // Ограничиваем историю (например, 1000 сообщений)
        if (history.length > 1000) {
            history.splice(1000);
        }
        
        await chrome.storage.local.set({ messageHistory: history });
    }

    // Получение истории
    static async getMessageHistory(limit = 50) {
        const data = await chrome.storage.local.get(['messageHistory']);
        const history = data.messageHistory || [];
        return history.slice(0, limit);
    }

    // Обновление статистики
    static async updateStats(updates) {
        const data = await chrome.storage.local.get(['stats']);
        const currentStats = data.stats || {};
        
        const updatedStats = { ...currentStats, ...updates };
        await chrome.storage.local.set({ stats: updatedStats });
    }

    // Очистка старых данных (можно вызывать раз в неделю)
    static async cleanupOldData() {
        const data = await chrome.storage.local.get(['messageHistory']);
        const history = data.messageHistory || [];
        
        // Удаляем сообщения старше 30 дней
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const filteredHistory = history.filter(msg => msg.timestamp > thirtyDaysAgo);
        
        await chrome.storage.local.set({ messageHistory: filteredHistory });
        console.log(`Очищено ${history.length - filteredHistory.length} старых сообщений`);
    }
} 
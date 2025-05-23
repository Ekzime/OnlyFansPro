// Popup Script для OnlyFans Manager Pro
// Обрабатывает взаимодействие с пользовательским интерфейсом

document.addEventListener('DOMContentLoaded', async () => {
    console.log('OnlyFans Manager Pro - Popup загружен');
    
    // Инициализация интерфейса
    await initializeInterface();
    
    // Настройка обработчиков событий
    setupEventListeners();
    
    // Загрузка данных
    await loadData();
});

// Инициализация интерфейса
async function initializeInterface() {
    // Настройка счетчика символов для текстового поля
    const messageInput = document.querySelector('.message-input');
    const charCounter = document.querySelector('.current-chars');
    
    if (messageInput && charCounter) {
        messageInput.addEventListener('input', () => {
            charCounter.textContent = messageInput.value.length;
        });
    }
    
    // Настройка слайдера интервала
    const intervalRange = document.getElementById('interval-range');
    const rangeValue = document.querySelector('.range-value');
    
    if (intervalRange && rangeValue) {
        intervalRange.addEventListener('input', () => {
            rangeValue.textContent = `${intervalRange.value} мин`;
        });
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Кнопки управления
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    if (startBtn) {
        startBtn.addEventListener('click', handleStart);
    }
    
    if (pauseBtn) {
        pauseBtn.addEventListener('click', handlePause);
    }
    
    if (stopBtn) {
        stopBtn.addEventListener('click', handleStop);
    }
    
    // Сохранение настроек при изменении
    const settingsInputs = document.querySelectorAll('input, textarea');
    settingsInputs.forEach(input => {
        input.addEventListener('change', saveSettings);
    });
}

// Обработчик запуска
async function handleStart() {
    const messageText = document.querySelector('.message-input').value.trim();
    
    if (!messageText) {
        showNotification('Введите текст сообщения', 'error');
        return;
    }
    
    const settings = collectSettings();
    settings.messageText = messageText;
    
    try {
        // Отправляем команду запуска в background script
        const response = await chrome.runtime.sendMessage({
            type: 'START_MESSAGING',
            data: settings
        });
        
        if (response.success) {
            updateUIState('running');
            showNotification('Рассылка запущена', 'success');
            addLogEntry('Рассылка запущена');
        }
    } catch (error) {
        console.error('Ошибка запуска:', error);
        showNotification('Ошибка запуска рассылки', 'error');
    }
}

// Обработчик паузы
async function handlePause() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'PAUSE_MESSAGING'
        });
        
        updateUIState('paused');
        showNotification('Рассылка приостановлена', 'warning');
        addLogEntry('Рассылка приостановлена');
    } catch (error) {
        console.error('Ошибка паузы:', error);
    }
}

// Обработчик остановки
async function handleStop() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'STOP_MESSAGING'
        });
        
        updateUIState('stopped');
        showNotification('Рассылка остановлена', 'info');
        addLogEntry('Рассылка остановлена');
    } catch (error) {
        console.error('Ошибка остановки:', error);
    }
}

// Сбор настроек из формы
function collectSettings() {
    const intervalRange = document.getElementById('interval-range');
    const timeInputs = document.querySelectorAll('.time-input');
    const checkboxes = document.querySelectorAll('.checkbox');
    
    const settings = {
        interval: parseInt(intervalRange?.value || 20),
        workingHours: {
            start: timeInputs[0]?.value || '10:00',
            end: timeInputs[1]?.value || '22:00'
        },
        onlineOnly: checkboxes[0]?.checked || false,
        randomDelay: checkboxes[1]?.checked || false
    };
    
    return settings;
}

// Сохранение настроек
async function saveSettings() {
    const settings = collectSettings();
    
    try {
        await chrome.storage.local.set({ settings });
        console.log('Настройки сохранены:', settings);
    } catch (error) {
        console.error('Ошибка сохранения настроек:', error);
    }
}

// Загрузка данных
async function loadData() {
    try {
        // Получаем статус и статистику
        const response = await chrome.runtime.sendMessage({
            type: 'GET_STATUS'
        });
        
        updateStats(response.stats || {});
        updateUIState(response.isRunning ? 'running' : 'stopped');
        
        // Загружаем сохраненные настройки
        const data = await chrome.storage.local.get(['settings']);
        if (data.settings) {
            applySettings(data.settings);
        }
        
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
    }
}

// Применение настроек к интерфейсу
function applySettings(settings) {
    const intervalRange = document.getElementById('interval-range');
    const rangeValue = document.querySelector('.range-value');
    const timeInputs = document.querySelectorAll('.time-input');
    const checkboxes = document.querySelectorAll('.checkbox');
    
    if (intervalRange && settings.interval) {
        intervalRange.value = settings.interval;
        if (rangeValue) {
            rangeValue.textContent = `${settings.interval} мин`;
        }
    }
    
    if (settings.workingHours && timeInputs.length >= 2) {
        timeInputs[0].value = settings.workingHours.start;
        timeInputs[1].value = settings.workingHours.end;
    }
    
    if (checkboxes.length >= 2) {
        checkboxes[0].checked = settings.onlineOnly;
        checkboxes[1].checked = settings.randomDelay;
    }
}

// Обновление статистики в интерфейсе
function updateStats(stats) {
    const statNumbers = document.querySelectorAll('.stat-number');
    
    if (statNumbers.length >= 3) {
        statNumbers[0].textContent = stats.onlineFans || 0;
        statNumbers[1].textContent = stats.sentToday || 0;
        statNumbers[2].textContent = stats.queueSize || 0;
    }
}

// Обновление состояния интерфейса
function updateUIState(state) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    // Сброс состояний
    statusDot?.classList.remove('online', 'offline');
    
    switch (state) {
        case 'running':
            statusDot?.classList.add('online');
            if (statusText) statusText.textContent = 'Активно';
            if (startBtn) startBtn.disabled = true;
            if (pauseBtn) pauseBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = false;
            break;
            
        case 'paused':
            if (statusText) statusText.textContent = 'Пауза';
            if (startBtn) startBtn.disabled = false;
            if (pauseBtn) pauseBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            break;
            
        case 'stopped':
        default:
            statusDot?.classList.add('offline');
            if (statusText) statusText.textContent = 'Остановлено';
            if (startBtn) startBtn.disabled = false;
            if (pauseBtn) pauseBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = true;
            break;
    }
}

// Показ уведомления
function showNotification(message, type = 'info') {
    // Создаем временное уведомление
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        padding: 10px 15px;
        border-radius: 6px;
        color: white;
        font-size: 12px;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    
    // Цвета в зависимости от типа
    const colors = {
        success: '#2ed573',
        error: '#ff4757',
        warning: '#ffa502',
        info: '#667eea'
    };
    
    notification.style.background = colors[type] || colors.info;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Удаляем через 3 секунды
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Добавление записи в лог
function addLogEntry(message) {
    const logContent = document.querySelector('.log-content');
    if (!logContent) return;
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    const time = new Date().toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-message">${message}</span>
    `;
    
    logContent.appendChild(entry);
    
    // Скроллим вниз
    logContent.scrollTop = logContent.scrollHeight;
    
    // Ограничиваем количество записей (макс 50)
    const entries = logContent.querySelectorAll('.log-entry');
    if (entries.length > 50) {
        entries[0].remove();
    }
}

// Обработка сообщений от background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'STATS_UPDATE':
            updateStats(message.data);
            break;
            
        case 'STATUS_CHANGE':
            updateUIState(message.data.status);
            addLogEntry(message.data.message);
            break;
            
        case 'MESSAGE_SENT':
            addLogEntry(`Сообщение отправлено: ${message.data.fanName}`);
            break;
    }
});

// Периодическое обновление данных
setInterval(async () => {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'GET_STATUS'
        });
        
        updateStats(response.stats || {});
    } catch (error) {
        // Игнорируем ошибки периодического обновления
    }
}, 5000); // Каждые 5 секунд 
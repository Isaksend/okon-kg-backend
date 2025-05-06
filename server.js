const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const amoCRM = require('./amocrm-client');

// Загрузка переменных окружения
dotenv.config();

const app = express();
const PORT = process.env.PORT || 9000;

// Настройка логирования
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

function log(message, type = 'info') {
    const date = new Date();
    const formattedDate = date.toISOString();
    const logPath = path.join(logDir, `${date.toISOString().split('T')[0]}.log`);

    const logEntry = `[${formattedDate}] [${type.toUpperCase()}] ${message}\n`;
    fs.appendFileSync(logPath, logEntry);
    console.log(`${type.toUpperCase()}: ${message}`);
}

// Middleware
app.use(cors({
    origin: [process.env.CORS_ORIGIN,'http://localhost:3000',  'https://okon.kg'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

app.get('/', (req, res) => {
    log('Получен запрос к корневому маршруту');
    res.send('Сервер работает');
});

// Логгирование запросов
app.use((req, res, next) => {
    log(`${req.method} ${req.path} - IP: ${req.ip}`);
    if (req.method === 'POST' || req.method === 'PUT') {
        log(`Тело запроса: ${JSON.stringify(req.body)}`);
    }
    next();
});

// Проверка здоровья сервера
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Сервер работает' });
});

// Роут для создания заявки в amoCRM
app.post('/api/amocrm/lead', async (req, res) => {
    try {
        const { name, phone, city, comment, utm, form_type } = req.body;

        log(`Получена заявка от ${name} (${phone}, ${city || 'Город не указан'}), форма: ${form_type || 'не указана'}`);
        if (utm) {
            log(`UTM-метки: ${JSON.stringify(utm)}`);
        }

        // Проверка наличия обязательных полей
        if (!name || !phone) {
            log(`Отклонена заявка с неполными данными: ${JSON.stringify(req.body)}`, 'warn');
            return res.status(400).json({
                success: false,
                message: 'Пожалуйста, укажите имя и телефон'
            });
        }

        let fullComment = '';

        // Добавляем информацию о типе формы
        if (form_type) {
            fullComment += `Форма: ${form_type === 'desktop' ? 'Десктопная' : 'Мобильная'}\n`;
        }
        // Добавляем комментарий пользователя
        if (comment) {
            fullComment += `Комментарий: ${comment}\n`;
        }

        // Добавляем UTM-метки в комментарий, если они есть
        if (utm && Object.keys(utm).length > 0) {
            fullComment += '\n\nUTM-метки:\n';
            for (const [key, value] of Object.entries(utm)) {
                fullComment += `${key}: ${value}\n`;
            }
        }

        // Создаем сделку с контактом
        const result = await amoCRM.createLeadWithContact(
            name,
            phone,
            city,
            fullComment
        );

        log(`Заявка успешно создана. ID сделки: ${result.lead_id}, ID контакта: ${result.contact_id}`);

        res.json({
            success: true,
            message: 'Заявка успешно создана в amoCRM',
            data: {
                lead_id: result.lead_id,
                contact_id: result.contact_id
            }
        });
    } catch (error) {
        log(`Ошибка при создании заявки: ${error.message}`, 'error');

        res.status(500).json({
            success: false,
            message: 'Произошла ошибка при создании заявки',
            error: error.message
        });
    }
});
// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    log(`Сервер запущен на порту ${PORT} и доступен на всех интерфейсах`);
});
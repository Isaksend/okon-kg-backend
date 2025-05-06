const express = require('express');
const app = express();

app.get('/', (req, res) => {
    console.log('Получен запрос к корневому маршруту');
    res.send('Сервер работает!');
});

app.get('/api/health', (req, res) => {
    console.log('Получен запрос к маршруту /api/health');
    res.json({ status: 'ok', message: 'Сервер работает' });
});

const PORT = 9000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Тестовый сервер запущен на порту ${PORT}`);
});
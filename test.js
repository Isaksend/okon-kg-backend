// test.js
const amoCRM = require('./amocrm-client');

async function testCreateLead() {
    try {
        // Тест для Бишкек
        console.log('\n=== Тест для Бишкек ===');
        await amoCRM.createLeadWithContact(
            'Тест Бишкек',
            '+996700123456',
            'Бишкек',
            'Тестовая заявка (Бишкек)'
        );

        // Тест для Ош
        console.log('\n=== Тест для Ош ===');
        await amoCRM.createLeadWithContact(
            'Тест Ош',
            '+996700654321',
            'Ош',
            'Тестовая заявка (Ош)'
        );

        // Тест для другого города
        console.log('\n=== Тест для другого города ===');
        await amoCRM.createLeadWithContact(
            'Тест Другой',
            '+996700987654',
            'Талас',
            'Тестовая заявка (Талас)'
        );

        // Тест без указания города
        console.log('\n=== Тест без города ===');
        await amoCRM.createLeadWithContact(
            'Тест Без Города',
            '+996700555555',
            '',
            'Тестовая заявка (без города)'
        );

        console.log('\nВсе тесты выполнены успешно!');
    } catch (error) {
        console.error('Ошибка при тестировании:', error.message);
    }
}

testCreateLead();
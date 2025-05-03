const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

class AmoCRMClient {
    constructor() {
        this.domain = process.env.AMO_DOMAIN;
        this.clientId = process.env.AMO_CLIENT_ID;
        this.clientSecret = process.env.AMO_CLIENT_SECRET;
        this.redirectUri = process.env.AMO_REDIRECT_URI;
        this.refreshToken = process.env.AMO_REFRESH_TOKEN;
        this.tokenPath = path.join(__dirname, 'token.json');

        // Проверяем наличие долгосрочного токена
        if (!this.refreshToken) {
            console.error('ВНИМАНИЕ: Не указан долгосрочный токен AMO_REFRESH_TOKEN в .env файле');
        }
    }

    async getAccessToken() {
        try {
            // Проверяем наличие токена в файле
            if (fs.existsSync(this.tokenPath)) {
                const tokenData = JSON.parse(fs.readFileSync(this.tokenPath));

                // Если токен действителен, используем его
                if (tokenData.expires_at > Date.now()) {
                    return tokenData.access_token;
                }
            }

            // Обновляем токен через refresh_token
            if (!this.refreshToken) {
                throw new Error('Отсутствует долгосрочный токен (refresh_token)');
            }

            const response = await axios.post(
                `https://${this.domain}/oauth2/access_token`,
                {
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken,
                    redirect_uri: this.redirectUri
                }
            );

            // Сохраняем новые токены
            const tokenData = {
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                expires_at: Date.now() + (response.data.expires_in * 1000)
            };

            // Обновляем долгосрочный токен в памяти
            this.refreshToken = response.data.refresh_token;

            // Сохраняем токены в файл
            fs.writeFileSync(this.tokenPath, JSON.stringify(tokenData));

            return tokenData.access_token;
        } catch (error) {
            console.error('Ошибка при получении токена:', error.message);
            if (error.response?.data) {
                console.error('Ответ от amoCRM:', JSON.stringify(error.response.data));
            }
            throw new Error('Не удалось получить токен доступа');
        }
    }

    async request(method, url, data = null) {
        try {
            const accessToken = await this.getAccessToken();

            const config = {
                method,
                url: `https://${this.domain}/api/v4/${url}`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                }
            };

            if (data) {
                config.data = data;
            }

            console.log(`Запрос: ${method.toUpperCase()} ${url}`);
            const response = await axios(config);
            return response.data;
        } catch (error) {
            console.error(`Ошибка запроса к amoCRM (${method} ${url}):`, error.message);
            if (error.response?.data) {
                console.error('Ответ от amoCRM:', JSON.stringify(error.response.data));
            }
            throw error;
        }
    }

    // Создание контакта
    async createContact(name, phone) {
        try {
            console.log(`Создание контакта: ${name}, ${phone}`);

            // Данные для создания контакта
            const contactData = [
                {
                    name: name,
                    custom_fields_values: [
                        {
                            field_code: "PHONE",
                            values: [
                                {
                                    value: phone,
                                    enum_code: "WORK"
                                }
                            ]
                        }
                    ]
                }
            ];

            const response = await this.request('post', 'contacts', contactData);
            console.log(`Контакт успешно создан, ID: ${response._embedded.contacts[0].id}`);
            return response._embedded.contacts[0].id;
        } catch (error) {
            console.error('Ошибка при создании контакта:', error.message);
            throw error;
        }
    }

    // Получение воронок по названию
    async getPipelineByCity(city) {
        try {
            console.log(`Поиск воронки для города: ${city}`);

            // Нормализуем название города (в нижний регистр для сравнения)
            const normalizedCity = city.toLowerCase().trim();

            // Получаем все воронки
            const pipelines = await this.request('get', 'leads/pipelines');
            if (!pipelines._embedded || !pipelines._embedded.pipelines || pipelines._embedded.pipelines.length === 0) {
                throw new Error('Не найдены доступные воронки');
            }

            console.log('Доступные воронки:');
            pipelines._embedded.pipelines.forEach(pipeline => {
                console.log(`- ${pipeline.name} (ID: ${pipeline.id})`);
            });

            // Ищем воронку по городу
            let targetPipeline;

            // Проверяем совпадение по названию города
            if (normalizedCity.includes('бишкек') || normalizedCity.includes('bishkek')) {
                targetPipeline = pipelines._embedded.pipelines.find(p =>
                    p.name.toLowerCase().includes('бишкек') || p.name.toLowerCase().includes('bishkek'));
            } else if (normalizedCity.includes('ош') || normalizedCity.includes('osh')) {
                targetPipeline = pipelines._embedded.pipelines.find(p =>
                    p.name.toLowerCase().includes('ош') || p.name.toLowerCase().includes('osh'));
            }

            // Если не нашли подходящую воронку, используем первую
            if (!targetPipeline) {
                console.log(`Не найдена воронка для города "${city}", используем первую доступную`);
                targetPipeline = pipelines._embedded.pipelines[0];
            }

            console.log(`Выбрана воронка: ${targetPipeline.name} (ID: ${targetPipeline.id})`);
            return targetPipeline;
        } catch (error) {
            console.error('Ошибка при получении воронки по городу:', error.message);
            throw error;
        }
    }

    // Создание сделки и привязка к контакту
    async createLead(name, contactId, city, comment = '') {
        try {
            console.log(`Создание сделки для контакта ${contactId}, город ${city}`);

            // Получаем воронку по городу
            const pipeline = await this.getPipelineByCity(city);

            // Выводим все статусы воронки для отладки
            console.log('Доступные статусы:');
            pipeline._embedded.statuses.forEach((status, index) => {
                console.log(`${index}. ${status.name} (ID: ${status.id})`);
            });

            // Ищем первый редактируемый статус или просто берем второй статус
            let statusId;
            let statusName;

            for (let i = 0; i < pipeline._embedded.statuses.length; i++) {
                const status = pipeline._embedded.statuses[i];
                if (i > 0 || status.is_editable !== false) {
                    statusId = status.id;
                    statusName = status.name;
                    break;
                }
            }

            // Если не нашли подходящий статус, берем второй в списке
            if (!statusId && pipeline._embedded.statuses.length > 1) {
                statusId = pipeline._embedded.statuses[1].id;
                statusName = pipeline._embedded.statuses[1].name;
            }
            // Если нет второго, берем первый и будем надеяться на лучшее
            else if (!statusId) {
                statusId = pipeline._embedded.statuses[0].id;
                statusName = pipeline._embedded.statuses[0].name;
            }

            console.log(`Выбран статус: ${statusName} (ID: ${statusId})`);

            // Данные для создания сделки
            const leadData = [
                {
                    name: `Заявка на обратный звонок от ${name}`,
                    pipeline_id: pipeline.id,
                    status_id: statusId,
                    _embedded: {
                        contacts: [
                            {
                                id: contactId
                            }
                        ],
                        tags: [
                            {
                                name: "Заявка с сайта"
                            },
                            {
                                name: "Форма обратного звонка"
                            },
                            {
                                name: city  // Добавляем город как тег
                            },
                            {
                                name: comment.includes('Форма: Десктопная') ? "Десктопная форма" : "Мобильная форма"
                            }
                        ]
                    }
                }
            ];

            // Создаем сделку
            const response = await this.request('post', 'leads', leadData);
            const leadId = response._embedded.leads[0].id;
            console.log(`Сделка успешно создана, ID: ${leadId}`);

            // Если есть комментарий, добавляем его как примечание
            if (comment) {
                await this.addNoteToLead(leadId, comment);
            }

            return leadId;
        } catch (error) {
            console.error('Ошибка при создании сделки:', error.message);
            throw error;
        }
    }

    // Добавление примечания к сделке
    async addNoteToLead(leadId, text) {
        try {
            console.log(`Добавление примечания к сделке ${leadId}`);

            const noteData = [
                {
                    entity_id: leadId,
                    note_type: "common",
                    params: {
                        text: text
                    }
                }
            ];

            await this.request('post', 'leads/notes', noteData);
            console.log('Примечание успешно добавлено');
        } catch (error) {
            console.error('Ошибка при добавлении примечания:', error.message);
        }
    }

    // Создание сделки с контактом (основной метод для интеграции)
    async createLeadWithContact(name, phone, city, comment = '') {
        try {
            console.log(`Обработка заявки: ${name}, ${phone}, ${city}`);

            // Проверка наличия города
            const cityValue = city || 'Не указан';

            // Формируем полный комментарий с городом
            let fullComment = '';
            if (city) {
                fullComment += `Город: ${city}\n`;
            } else {
                fullComment += `Город: Не указан\n`;
            }
            if (comment) {
                fullComment += comment;
            }

            // Создаем контакт
            const contactId = await this.createContact(name, phone);

            // Создаем сделку с учетом города
            const leadId = await this.createLead(name, contactId, cityValue, fullComment);

            return {
                contact_id: contactId,
                lead_id: leadId
            };
        } catch (error) {
            console.error('Ошибка при создании сделки с контактом:', error.message);
            throw error;
        }
    }
}

module.exports = new AmoCRMClient();
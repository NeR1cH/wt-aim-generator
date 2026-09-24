document.addEventListener("DOMContentLoaded", () => {
    // Сохранение и загрузка API ключа
    const apiKeyInput = document.getElementById('apiKey');
    if (apiKeyInput) {
        apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
        apiKeyInput.addEventListener('change', (e) => {
            localStorage.setItem('gemini_api_key', e.target.value.trim());
            logToConsole('API KEY UPDATED (STORED LOCALLY)', 'sys-msg');
        });
    }

    // Состояние приложения
    let currentImageBase64 = null;
    let currentVectors = []; // Сырые векторы от Gemini

    const canvas = document.getElementById('aimCanvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const lineCountDisplay = document.getElementById('lineCount');
    const bgToggle = document.getElementById('bgToggle');
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const generateBtn = document.getElementById('generateBtn');
    const exportBtn = document.getElementById('exportBtn');
    const loadSampleBtn = document.getElementById('loadSampleBtn');
    const detailLevelSelect = document.getElementById('detailLevel');

    // Функция вывода в консоль
    function logToConsole(message, className = 'sys-msg') {
        const consoleLog = document.getElementById('consoleLog');
        if (!consoleLog) return;
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        consoleLog.innerHTML += `<br><span class="${className}">[${time}] ${message}</span>`;
        consoleLog.scrollTop = consoleLog.scrollHeight;
    }

    // Обработка Dropzone
    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--neon-green)';
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = 'var(--border-color)';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--border-color)';
            if (e.dataTransfer.files.length > 0) {
                handleFile(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFile(e.target.files[0]);
            }
        });
    }

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            logToConsole('ОШИБКА: Файл должен быть изображением', 'error-msg');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            currentImageBase64 = e.target.result;
            dropzone.innerHTML = `<span>LOADED: ${file.name.substring(0, 20)}</span>`;
            logToConsole(`IMAGE DATA ACQUIRED: ${file.name} (${Math.round(file.size / 1024)} KB)`, 'sys-msg');
        };
        reader.readAsDataURL(file);
    }

    // Создание тестового образца (силуэт боевого самолета/танка)
    if (loadSampleBtn) {
        loadSampleBtn.addEventListener('click', () => {
            createSampleImage();
        });
    }

    function createSampleImage() {
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = 250;
        sampleCanvas.height = 250;
        const sCtx = sampleCanvas.getContext('2d');

        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(0, 0, 250, 250);

        sCtx.fillStyle = '#000000';
        sCtx.beginPath();
        // Нарисуем силуэт истребителя
        sCtx.moveTo(125, 20); // нос
        sCtx.lineTo(135, 80);
        sCtx.lineTo(230, 140); // правое крыло
        sCtx.lineTo(225, 155);
        sCtx.lineTo(135, 140);
        sCtx.lineTo(135, 200);
        sCtx.lineTo(170, 225); // правый киль
        sCtx.lineTo(165, 235);
        sCtx.lineTo(125, 220); // сопло
        sCtx.lineTo(85, 235);
        sCtx.lineTo(80, 225);
        sCtx.lineTo(115, 200);
        sCtx.lineTo(115, 140);
        sCtx.lineTo(25, 155);
        sCtx.lineTo(20, 140); // левое крыло
        sCtx.lineTo(115, 80);
        sCtx.closePath();
        sCtx.fill();

        currentImageBase64 = sampleCanvas.toDataURL('image/png');
        if (dropzone) {
            dropzone.innerHTML = `<span>LOADED: JET_FIGHTER_SAMPLE.PNG</span>`;
        }
        logToConsole('LOADED TARGET: JET_FIGHTER_SAMPLE', 'sys-msg');
    }

    // Слушатели ползунков калибровки (смещение и масштаб)
    ['offsetX', 'offsetY', 'scale'].forEach(id => {
        const slider = document.getElementById(id);
        const display = document.getElementById(id.replace('offset', 'val').replace('scale', 'valScale'));
        if (!slider) return;

        slider.addEventListener('input', () => {
            const val = parseFloat(slider.value);
            if (display) display.textContent = val.toFixed(1);
            renderCanvas();
        });
    });

    if (bgToggle) {
        bgToggle.addEventListener('change', () => {
            logToConsole(bgToggle.checked ? 'COMBAT BG SIMULATION: ON' : 'COMBAT BG SIMULATION: OFF', 'sys-msg');
            renderCanvas();
        });
    }

    // Фоновая сетка телеметрии
    function drawTelemetryGrid(ctx, w, h, cx, cy) {
        ctx.save();
        ctx.strokeStyle = 'rgba(42, 59, 76, 0.4)';
        ctx.lineWidth = 1;

        // Вспомогательная сетка
        const step = 40;
        for (let x = 0; x < w; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Осевые линии
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(w, cy);
        ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
        ctx.stroke();

        // Окружности дальности
        ctx.strokeStyle = 'rgba(57, 255, 20, 0.15)';
        [80, 160, 240].forEach(r => {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Центральное перекрестие прицела
        ctx.strokeStyle = 'rgba(57, 255, 20, 0.5)';
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy); ctx.lineTo(cx + 15, cy);
        ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy + 15);
        ctx.stroke();

        // Угловые метки HUD
        ctx.strokeStyle = 'rgba(57, 255, 20, 0.5)';
        const pad = 20;
        const corner = 30;
        ctx.beginPath();
        ctx.moveTo(pad, pad + corner); ctx.lineTo(pad, pad); ctx.lineTo(pad + corner, pad);
        ctx.moveTo(w - pad - corner, pad); ctx.lineTo(w - pad, pad); ctx.lineTo(w - pad, pad + corner);
        ctx.moveTo(pad, h - pad - corner); ctx.lineTo(pad, h - pad); ctx.lineTo(pad + corner, h - pad);
        ctx.moveTo(w - pad - corner, h - pad); ctx.lineTo(w - pad, h - pad); ctx.lineTo(w - pad, h - pad - corner);
        ctx.stroke();

        // Инфо-текст в стиле авионики
        ctx.fillStyle = 'rgba(57, 255, 20, 0.6)';
        ctx.font = '10px Courier New, monospace';
        ctx.fillText('OPTIC ZOOM: 8.0x', pad + 5, pad + 15);
        ctx.fillText('GRID: 100 MIL', pad + 5, pad + 28);
        ctx.fillText('SIGHT MODE: APFSDS', w - pad - 120, pad + 15);
        ctx.fillText('ELEV: +0.0°', w - pad - 120, pad + 28);

        ctx.restore();
    }

    // Симуляция игрового прицела для проверки ("Тест в бою")
    function drawGameReticleSimulation(ctx, cx, cy) {
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;
        ctx.save();

        // Фон неба/земли
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#1c2833');
        grad.addColorStop(0.48, '#2e4053');
        grad.addColorStop(0.52, '#212f3d');
        grad.addColorStop(1, '#17202a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Линия горизонта
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(w, cy);
        ctx.stroke();

        // Силуэт танка противника вдалеке
        ctx.fillStyle = 'rgba(15, 20, 25, 0.7)';
        const tx = cx - 40;
        const ty = cy + 15;
        ctx.fillRect(tx, ty, 80, 20);
        ctx.fillRect(tx + 20, ty - 12, 35, 12);
        ctx.fillRect(tx - 30, ty - 8, 30, 4);

        // Имитация делений дальномера War Thunder
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '10px Courier New, monospace';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let y = 30; y <= 240; y += 30) {
            ctx.moveTo(cx - 10, cy + y);
            ctx.lineTo(cx + 10, cy + y);
        }
        ctx.stroke();

        [4, 8, 12, 16, 20, 24].forEach((dist, idx) => {
            const dy = cy + (idx + 1) * 30;
            ctx.fillText(`${dist}`, cx + 16, dy + 3);
        });

        // Круглая виньетка оптики
        const opticGrad = ctx.createRadialGradient(cx, cy, 220, cx, cy, 380);
        opticGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        opticGrad.addColorStop(0.8, 'rgba(0, 5, 10, 0.7)');
        opticGrad.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
        ctx.fillStyle = opticGrad;
        ctx.fillRect(0, 0, w, h);

        ctx.restore();
    }

    // Обновленная функция отрисовки с учетом оффсетов и масштаба
    function renderCanvas() {
        if (!ctx || !canvas) return;

        // Считываем значения калибровки
        const offsetX = parseFloat(document.getElementById('offsetX').value) || 0;
        const offsetY = parseFloat(document.getElementById('offsetY').value) || 0;
        const scale = parseFloat(document.getElementById('scale').value) || 1.0;
        const showGameBg = document.getElementById('bgToggle') ? document.getElementById('bgToggle').checked : false;

        // Очистка холста
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // Отрисовка сетки телеметрии или тестового фона
        if (!showGameBg) {
            drawTelemetryGrid(ctx, canvas.width, canvas.height, centerX, centerY);
        } else {
            drawGameReticleSimulation(ctx, centerX, centerY);
        }

        if (!currentVectors || currentVectors.length === 0) return;

        // Отрисовка векторов ИИ
        ctx.save();
        ctx.strokeStyle = '#39ff14';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#39ff14';
        ctx.shadowBlur = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        currentVectors.forEach(item => {
            if (item.type === 'line') {
                // Применяем масштаб и смещение
                const factor = 8 * scale;
                const x1 = centerX + (item.x1 * factor) + (offsetX * 4);
                const y1 = centerY + (item.y1 * factor) + (offsetY * 4);
                const x2 = centerX + (item.x2 * factor) + (offsetX * 4);
                const y2 = centerY + (item.y2 * factor) + (offsetY * 4);

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            } else if (item.type === 'circle') {
                const factor = 8 * scale;
                const cx = centerX + (item.x * factor) + (offsetX * 4);
                const cy = centerY + (item.y * factor) + (offsetY * 4);
                const r = Math.abs((item.radius || 2) * factor);

                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
            }
        });

        ctx.restore();
    }

    // Прием данных из генератора
    function drawOnCanvas(vectorData) {
        if (!vectorData) return;

        if (Array.isArray(vectorData.objects)) {
            currentVectors = vectorData.objects;
        } else if (Array.isArray(vectorData.lines)) {
            currentVectors = vectorData.lines.map(l => ({ type: 'line', x1: l[0], y1: l[1], x2: l[2], y2: l[3] }));
        } else if (Array.isArray(vectorData)) {
            currentVectors = vectorData;
        }

        // Обновляем статистику объектов
        if (lineCountDisplay) {
            lineCountDisplay.textContent = currentVectors.length;
        }

        logToConsole(`[RADAR] ОТОБРАЖЕНО ${currentVectors.length} ОБЪЕКТОВ ГЕОМЕТРИИ`, 'sys-msg');
        renderCanvas();
    }

    // Генерация векторов из изображения через Gemini API
    async function generateVectorsFromImage(base64Image, apiKey) {
        if (!base64Image) {
            logToConsole('[SYS_ERROR] Изображение не загружено', 'error-msg');
            return null;
        }

        let rawBase64 = base64Image;
        let mimeType = "image/jpeg";
        if (base64Image.includes(';base64,')) {
            const parts = base64Image.split(';base64,');
            mimeType = parts[0].replace('data:', '') || 'image/jpeg';
            rawBase64 = parts[1];
        }

        // Если передан API ключ пользователем, обращаемся напрямую к Gemini API с отключением фильтров
        if (apiKey) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
            const requestBody = {
                contents: [{
                    parts: [
                        { text: "Ты — математический ИИ-движок для генерации векторной графики. Твоя задача — переводить визуальные контуры объектов на изображениях в массив геометрических примитивов.\nЦентр координат [0, 0]. Ось Y инвертирована (отрицательные значения вверх).\nМинимизируй количество элементов, выдавай только ключевые контуры непрерывными отрезками.\nТвой ответ должен быть СТРОГО в формате валидного JSON: {\"objects\": [{\"type\": \"line\", \"x1\": 0, \"y1\": 0, \"x2\": 10, \"y2\": 10}]}\nНикакого текста, markdown-разметки или пояснений. Только чистый JSON." },
                        { inlineData: { mimeType: mimeType, data: rawBase64 } }
                    ]
                }],
                safetySettings: [
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ],
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: "application/json"
                }
            };

            try {
                logToConsole('[SYS] ЗАПРОС К GEMINI 3.8 FLASH (SAFETY: BLOCK_NONE)...', 'sys-msg');
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    if (response.status === 429) throw new Error("Квота API исчерпана (RESOURCE_EXHAUSTED). Проверьте биллинг Pro-аккаунта.");
                    throw new Error(`Ошибка API: ${err.error?.message || response.status}`);
                }

                const data = await response.json();

                if (data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason === 'SAFETY') {
                    throw new Error("CONTENT REJECTED BY SAFETY PROTOCOL. Загрузите другое изображение.");
                }

                const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (textOutput) {
                    const parsed = JSON.parse(textOutput);
                    logToConsole('[SYS] ПРЯМОЙ ОТВЕТ GEMINI УСПЕШНО РАСПАРСЕН', 'sys-msg');
                    return parsed;
                }
            } catch (error) {
                logToConsole(`[SYS_WARN] Прямой API запрос: ${error.message}. Переключение на локальный сервер...`, 'sys-msg');
            }
        }

        // Серверный endpoint (/api/generate)
        try {
            logToConsole('[SYS] МАРШРУТИЗАЦИЯ ЧЕРЕЗ СЕРВЕРНЫЙ СЕРВИС...', 'sys-msg');
            const detail = detailLevelSelect ? detailLevelSelect.value : 'silhouette';
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Image,
                    detailLevel: detail,
                    apiKey: apiKey || undefined
                })
            });

            const result = await response.json();
            if (result.success) {
                if (result.objects && result.objects.length > 0) {
                    logToConsole(`[SYS] ПОЛУЧЕНО ${result.objects.length} ОБЪЕКТОВ (${result.source})`, 'sys-msg');
                    return { objects: result.objects };
                } else if (result.lines && result.lines.length > 0) {
                    logToConsole(`[SYS] ПОЛУЧЕНО ${result.lines.length} ЛИНИЙ (${result.source})`, 'sys-msg');
                    return {
                        objects: result.lines.map(l => ({ type: 'line', x1: l[0], y1: l[1], x2: l[2], y2: l[3] }))
                    };
                }
            }
            throw new Error(result.message || 'Ошибка обработки данных');
        } catch (err) {
            logToConsole(`[SYS_ERROR] ${err.message}`, 'error-msg');
            return null;
        }
    }

    // Связка интерфейса с функцией генерации
    if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
            if (!currentImageBase64) {
                logToConsole('НЕТ ИЗОБРАЖЕНИЯ. АВТОЗАГРУЗКА ТАКТИЧЕСКОГО ОБРАЗЦА...', 'sys-msg');
                createSampleImage();
            }

            generateBtn.disabled = true;
            generateBtn.textContent = 'ОБРАБОТКА ДАННЫХ ИИ...';
            logToConsole('[SYS] ИНИЦИАЛИЗАЦИЯ ВЕКТОРНОГО ПАРСЕРА...', 'sys-msg');

            try {
                const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
                const vectorData = await generateVectorsFromImage(currentImageBase64, apiKey);
                if (vectorData) {
                    drawOnCanvas(vectorData);
                }
            } catch (err) {
                logToConsole(`[SYS_ERROR] ${err.message}`, 'error-msg');
            } finally {
                generateBtn.disabled = false;
                generateBtn.textContent = 'ИНИЦИАЛИЗАЦИЯ ГЕНЕРАЦИИ';
            }
        });
    }

    // Экспорт в .BLK формат War Thunder
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (!currentVectors || currentVectors.length === 0) {
                logToConsole('[SYS_ERROR] НЕТ ДАННЫХ ДЛЯ ЭКСПОРТА', 'error-msg');
                return;
            }

            const offsetX = parseFloat(document.getElementById('offsetX').value) || 0;
            const offsetY = parseFloat(document.getElementById('offsetY').value) || 0;
            const scale = parseFloat(document.getElementById('scale').value) || 1.0;

            // Нормализация координат для игрового движка War Thunder
            // В игре координаты прицела рассчитываются в тысячных дистанции
            const wtLines = [];
            const blkScale = 0.05 * scale;
            const blkOffX = offsetX * 0.02;
            const blkOffY = offsetY * 0.02;

            currentVectors.forEach(item => {
                if (item.type === 'line') {
                    const x1 = ((item.x1 * blkScale) + blkOffX).toFixed(6);
                    const y1 = ((item.y1 * blkScale) + blkOffY).toFixed(6);
                    const x2 = ((item.x2 * blkScale) + blkOffX).toFixed(6);
                    const y2 = ((item.y2 * blkScale) + blkOffY).toFixed(6);
                    wtLines.push(`  line { line:p4 = ${x1}, ${y1}, ${x2}, ${y2}; move:b = false; }`);
                }
            });

            const blkContent = 
`crosshairHorVertSize:p2=3, 2
rangefinderProgressBarColor1:c=0, 255, 0, 64
rangefinderProgressBarColor2:c=255, 255, 255, 64
rangefinderTextScale:r=0.7
rangefinderUseThousandth:b=no
rangefinderVerticalOffset:r=0.1
rangefinderHorizontalOffset:r=5
detectAllyTextScale:r=0.7
detectAllyOffset:p2=4, 0.05
fontSizeMult:r=1
lineSizeMult:r=1
drawCentralLineVert:b=yes
drawCentralLineHorz:b=yes
drawSightMask:b=yes
useSmoothEdge:b=yes
crosshairColor:c=0, 0, 0, 0
crosshairLightColor:c=0, 0, 0, 0
crosshairDistHorSizeMain:p2=0.03, 0.02
crosshairDistHorSizeAdditional:p2=0.005, 0.003
distanceCorrectionPos:p2=-0.26, -0.05
drawDistanceCorrection:b=yes

crosshair_distances{
  distance:p3=200, 0, 0
  distance:p3=400, 4, 0
  distance:p3=800, 8, 0
  distance:p3=1200, 12, 0
  distance:p3=1600, 16, 0
  distance:p3=2000, 20, 0
}

crosshair_hor_ranges{}

matchExpClass {
  exp_tank:b = yes
  exp_heavy_tank:b = yes
  exp_tank_destroyer:b = yes
  exp_SPAA:b = yes
}

drawLines{
${wtLines.join('\n')}
}

drawQuads{}
`;

            // Скачивание файла
            const blob = new Blob([blkContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'custom_sight.blk';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            logToConsole('[SYS] ФАЙЛ .BLK УСПЕШНО СФОРМИРОВАН И ВЫГРУЖЕН', 'sys-msg');
        });
    }

    // Первоначальная инициализация
    createSampleImage();
    // Загрузка базового тактического прицела для мгновенного отображения
    currentVectors = [
        { type: 'line', x1: -20, y1: 0, x2: -5, y2: 0 },
        { type: 'line', x1: 5, y1: 0, x2: 20, y2: 0 },
        { type: 'line', x1: 0, y1: -18, x2: 0, y2: -5 },
        { type: 'line', x1: 0, y1: 5, x2: 0, y2: 18 },
        { type: 'line', x1: -3, y1: 3, x2: 0, y2: 0 },
        { type: 'line', x1: 0, y1: 0, x2: 3, y2: 3 },
        { type: 'line', x1: -3, y1: -10, x2: 3, y2: -10 },
        { type: 'line', x1: -4, y1: -5, x2: 4, y2: -5 },
        { type: 'line', x1: -4, y1: 5, x2: 4, y2: 5 },
        { type: 'line', x1: -3, y1: 10, x2: 3, y2: 10 }
    ];

    if (lineCountDisplay) {
        lineCountDisplay.textContent = currentVectors.length;
    }
    renderCanvas();
    logToConsole('AVIONICS SUBSYSTEM INITIALIZED', 'sys-msg');
    logToConsole('DEFAULT TACTICAL RETICLE LOADED (10 OBJECTS)', 'sys-msg');
});

import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.static(__dirname));

// Fallback geometric vector line generator when Gemini key is unavailable or fails
function generateContourLines(detailLevel = 'silhouette') {
    const isDetailed = detailLevel === 'detailed';
    const lines = [];

    // Aviation/WT reticle base crosshair
    lines.push([-40, 0, -10, 0]);
    lines.push([10, 0, 40, 0]);
    lines.push([0, -35, 0, -10]);
    lines.push([0, 10, 0, 35]);

    // Center chevron
    lines.push([-6, 6, 0, 0]);
    lines.push([0, 0, 6, 6]);

    // Range ladder marks
    [-20, -10, 10, 20].forEach(y => {
        lines.push([-5, y, 5, y]);
    });

    if (isDetailed) {
        // Detailed tactical angles & HUD brackets
        lines.push([-30, -25, -20, -25]);
        lines.push([-30, -25, -30, -15]);
        lines.push([30, -25, 20, -25]);
        lines.push([30, -25, 30, -15]);
        lines.push([-30, 25, -20, 25]);
        lines.push([-30, 25, -30, 15]);
        lines.push([30, 25, 20, 25]);
        lines.push([30, 25, 30, 15]);

        // Stadiametric rangefinder curve approximation
        for (let i = 0; i < 8; i++) {
            const x1 = 12 + i * 2.5;
            const y1 = 20 - i * 1.5;
            const x2 = 12 + (i + 1) * 2.5;
            const y2 = 20 - (i + 1) * 1.5;
            lines.push([x1, y1, x2, y2]);
        }
    }

    return lines;
}

app.post('/api/generate', async (req, res) => {
    try {
        const { image, detailLevel = 'silhouette', apiKey } = req.body;
        const effectiveKey = apiKey || process.env.GEMINI_API_KEY;

        if (!effectiveKey) {
            console.warn('[WT AIM] No Gemini API key provided. Using built-in tactical vector generator.');
            const fallbackLines = generateContourLines(detailLevel);
            const fallbackObjects = fallbackLines.map(([x1, y1, x2, y2]) => ({ type: 'line', x1, y1, x2, y2 }));
            return res.json({
                success: true,
                source: 'offline-vector-engine',
                message: 'No Gemini API key detected. Generated baseline tactical sight vector lines.',
                objects: fallbackObjects,
                lines: fallbackLines
            });
        }

        const ai = new GoogleGenAI({
            apiKey: effectiveKey,
            httpOptions: {
                headers: {
                    'User-Agent': 'aistudio-build'
                }
            }
        });

        // Parse base64 data
        let mimeType = 'image/png';
        let base64Data = image;

        if (image && image.includes(';base64,')) {
            const parts = image.split(';base64,');
            mimeType = parts[0].replace('data:', '');
            base64Data = parts[1];
        }

        const systemInstruction = `Ты — математический ИИ-движок для генерации векторной графики. Твоя задача — переводить визуальные контуры объектов на изображениях в массив геометрических примитивов.
Центр координат [0, 0]. Ось Y инвертирована (отрицательные значения вверх).
Минимизируй количество элементов, выдавай только ключевые контуры непрерывными отрезками.
Твой ответ должен быть СТРОГО в формате валидного JSON: {"objects": [{"type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 10}]}. Никакого текста, markdown-разметки или пояснений. Только чистый JSON.`;

        const promptText = `Проанализируй изображение и сгенерируй геометрию в JSON. Режим детализации: ${detailLevel === 'detailed' ? 'детализированный (60-120 линий)' : 'минималистичный силуэт (25-50 линий)'}. Координаты x1, y1, x2, y2 в диапазоне от -50 до 50.`;

        const imagePart = {
            inlineData: {
                mimeType: mimeType || 'image/png',
                data: base64Data
            }
        };

        const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: {
                parts: [imagePart, { text: promptText }]
            },
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        objects: {
                            type: Type.ARRAY,
                            description: 'Массив геометрических примитивов',
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    type: { type: Type.STRING },
                                    x1: { type: Type.NUMBER },
                                    y1: { type: Type.NUMBER },
                                    x2: { type: Type.NUMBER },
                                    y2: { type: Type.NUMBER }
                                },
                                required: ['type', 'x1', 'y1', 'x2', 'y2']
                            }
                        }
                    },
                    required: ['objects']
                }
            }
        });

        const textOutput = response.text;
        const parsed = JSON.parse(textOutput || '{"objects": []}');
        const rawObjects = parsed.objects || [];
        const validObjects = rawObjects.filter(o => 
            o && typeof o.x1 === 'number' && typeof o.y1 === 'number' && 
            typeof o.x2 === 'number' && typeof o.y2 === 'number' &&
            !isNaN(o.x1) && !isNaN(o.y1) && !isNaN(o.x2) && !isNaN(o.y2)
        ).map(o => ({
            type: o.type || 'line',
            x1: Math.round(o.x1 * 10) / 10,
            y1: Math.round(o.y1 * 10) / 10,
            x2: Math.round(o.x2 * 10) / 10,
            y2: Math.round(o.y2 * 10) / 10
        }));

        const validLines = validObjects.map(o => [o.x1, o.y1, o.x2, o.y2]);

        if (validObjects.length === 0) {
            const fallbackLines = generateContourLines(detailLevel);
            const fallbackObjects = fallbackLines.map(([x1, y1, x2, y2]) => ({ type: 'line', x1, y1, x2, y2 }));
            return res.json({
                success: true,
                source: 'hybrid-fallback',
                message: 'AI returned 0 objects. Generated baseline avionics geometry.',
                objects: fallbackObjects,
                lines: fallbackLines
            });
        }

        return res.json({
            success: true,
            source: 'gemini-3.8-flash',
            objects: validObjects,
            lines: validLines
        });

    } catch (err) {
        console.error('[WT AIM] Error in /api/generate:', err);
        const fallback = generateContourLines(req.body.detailLevel || 'silhouette');
        const fallbackObjects = fallback.map(([x1, y1, x2, y2]) => ({ type: 'line', x1, y1, x2, y2 }));
        return res.json({
            success: true,
            source: 'fallback-on-error',
            message: `Gemini processing fallback: ${err.message}`,
            objects: fallbackObjects,
            lines: fallback
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[WT AIM Generator] Avionics OS running on http://0.0.0.0:${PORT}`);
});

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type { TTSEngine, Voice, EngineConfig } from './TTSEngine';

const GEMINI_VOICES: Voice[] = [
    // Female voices
    { id: 'Aoede', name: 'Aoede', gender: 'female' },
    { id: 'Kore', name: 'Kore', gender: 'female' },
    { id: 'Leda', name: 'Leda', gender: 'female' },
    { id: 'Zephyr', name: 'Zephyr', gender: 'female' },
    { id: 'Algenib', name: 'Algenib', gender: 'female' },
    { id: 'Algieba', name: 'Algieba', gender: 'female' },
    { id: 'Callirrhoe', name: 'Callirrhoe', gender: 'female' },
    { id: 'Sulafat', name: 'Sulafat', gender: 'female' },
    { id: 'Vindemiatrix', name: 'Vindemiatrix', gender: 'female' },
    { id: 'Laomedeia', name: 'Laomedeia', gender: 'female' },
    { id: 'Pulcherrima', name: 'Pulcherrima', gender: 'female' },
    { id: 'Despina', name: 'Despina', gender: 'female' },
    { id: 'Erinome', name: 'Erinome', gender: 'female' },
    { id: 'Autonoe', name: 'Autonoe', gender: 'female' },
    // Male voices
    { id: 'Charon', name: 'Charon', gender: 'male' },
    { id: 'Fenrir', name: 'Fenrir', gender: 'male' },
    { id: 'Orus', name: 'Orus', gender: 'male' },
    { id: 'Achird', name: 'Achird', gender: 'male' },
    { id: 'Achernar', name: 'Achernar', gender: 'male' },
    { id: 'Alnilam', name: 'Alnilam', gender: 'male' },
    { id: 'Puck', name: 'Puck', gender: 'male' },
    { id: 'Umbriel', name: 'Umbriel', gender: 'male' },
    { id: 'Zubenelgenubi', name: 'Zubenelgenubi', gender: 'male' },
    { id: 'Iapetus', name: 'Iapetus', gender: 'male' },
    { id: 'Gacrux', name: 'Gacrux', gender: 'male' },
    { id: 'Enceladus', name: 'Enceladus', gender: 'male' },
    { id: 'Rasalgethi', name: 'Rasalgethi', gender: 'male' },
    { id: 'Sadachbia', name: 'Sadachbia', gender: 'male' },
    { id: 'Sadaltager', name: 'Sadaltager', gender: 'male' },
    { id: 'Schedar', name: 'Schedar', gender: 'male' },
];

// Shared key rotation state
let currentKeyIndex = 0;
const keyUsageCount = new Map<string, number>();
const keyLastUsed = new Map<string, number>();
let globalLastUsed = 0;
const keyCooldowns = new Map<string, number>();

function getNextApiKey(config: EngineConfig): string {
    const rawKeys = [config.apiKey, ...(config.apiKeys || [])].filter(k => k && k.trim()) as string[];
    const allKeys = Array.from(new Set(rawKeys));
    if (allKeys.length === 1) return allKeys[0];

    const now = Date.now();
    const validKeys = allKeys.filter(key => now >= (keyCooldowns.get(key) || 0));

    if (validKeys.length === 0) {
        let minCooldown = Infinity, bestKey = allKeys[0];
        for (const key of allKeys) {
            const cd = keyCooldowns.get(key) || 0;
            if (cd < minCooldown) { minCooldown = cd; bestKey = key; }
        }
        return bestKey;
    }

    const key = validKeys[currentKeyIndex % validKeys.length];
    currentKeyIndex = (currentKeyIndex + 1) % validKeys.length;
    keyUsageCount.set(key, (keyUsageCount.get(key) || 0) + 1);
    console.log(`[Gemini] Using key ...${key.slice(-4)} (used ${keyUsageCount.get(key)} times). Available: ${validKeys.length}/${allKeys.length}`);
    return key;
}

async function waitForKey(key: string) {
    const minInterval = 4000;
    const minGlobalInterval = 1100;
    const now = Date.now();
    let targetGlobalTime = Math.max(globalLastUsed + minGlobalInterval, now);
    const globalWait = targetGlobalTime - now;
    globalLastUsed = targetGlobalTime;
    if (globalWait > 0) await new Promise(r => setTimeout(r, globalWait));

    const lastUsed = keyLastUsed.get(key) || 0;
    const elapsed = Date.now() - lastUsed;
    if (elapsed < minInterval) await new Promise(r => setTimeout(r, minInterval - elapsed));
    keyLastUsed.set(key, Date.now());
}

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function pcmToWav(pcmBytes: Uint8Array): Uint8Array {
    const sampleRate = 24000, numChannels = 1, bitsPerSample = 16;
    const dataSize = pcmBytes.length;
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const result = new Uint8Array(44 + dataSize);
    result.set(new Uint8Array(header));
    result.set(pcmBytes, 44);
    return result;
}

export class GeminiEngine implements TTSEngine {
    readonly name = 'Google Gemini';
    readonly id = 'gemini';
    readonly requiresApiKey = true;
    readonly description = '30 neural voices, free tier available';

    async getVoices(): Promise<Voice[]> {
        return [...GEMINI_VOICES];
    }

    async generateAudio(
        text: string,
        voiceId: string,
        config: EngineConfig,
        onStatusUpdate?: (message: string) => void,
        _retryCount = 0
    ): Promise<Blob> {
        const maxRetries = 10;
        const apiKey = getNextApiKey(config);
        await waitForKey(apiKey);

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: config.modelName || 'gemini-2.5-flash-preview-tts' });

        const styleParts: string[] = [];
        if (config.speed) {
            if (config.speed <= 0.7) styleParts.push('Speak very slowly.');
            else if (config.speed < 1.0) styleParts.push('Speak slightly slowly.');
            else if (config.speed > 1.3) styleParts.push('Speak very quickly.');
            else if (config.speed > 1.0) styleParts.push('Speak slightly quickly.');
        }
        if (config.stylePrompt) styleParts.push(config.stylePrompt);

        const fullPrompt = 'Read the following text aloud naturally: ' + text;

        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ];

        try {
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                safetySettings,
                generationConfig: {
                    temperature: config.temperature ?? 1,
                    // @ts-ignore
                    responseModalities: ['AUDIO'],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId } } },
                },
            });

            const parts = result.response.candidates?.[0]?.content?.parts;
            if (!parts?.length) throw new Error('No response parts received');

            const audioPart = parts.find(p => p.inlineData?.mimeType?.includes('audio'));
            if (!audioPart?.inlineData?.data) throw new Error('No audio data in response');

            const binaryStr = atob(audioPart.inlineData.data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

            const mime = audioPart.inlineData.mimeType || '';
            const isPCM = mime.includes('l16') || mime.includes('pcm') ||
                (mime.startsWith('audio/') && !mime.includes('mp3') && !mime.includes('wav'));

            if (isPCM) {
                const wavBytes = pcmToWav(bytes);
                return new Blob([wavBytes], { type: 'audio/wav' });
            }
            return new Blob([bytes], { type: mime || 'audio/mp3' });

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            const isRetryable = /Rate Limit|429|quota|503|overloaded|No response|fetch failed/i.test(msg);

            if (isRetryable && _retryCount < maxRetries) {
                let waitTime = Math.min(Math.max(20000, 2000) * Math.pow(2, _retryCount) + Math.random() * 1000, 60000);

                const retryMatch = msg.match(/retry in\s+([\d.]+)\s*s/i);
                if (retryMatch) {
                    waitTime = parseFloat(retryMatch[1]) * 1000 + 2000;
                    keyCooldowns.set(apiKey, Date.now() + waitTime);
                } else if (/429|quota|rate limit/i.test(msg)) {
                    keyCooldowns.set(apiKey, Date.now() + 60000);
                }

                const statusMsg = `Retry ${_retryCount + 1}/${maxRetries} in ${Math.round(waitTime / 1000)}s...`;
                onStatusUpdate?.(statusMsg);
                await new Promise(r => setTimeout(r, waitTime));
                return this.generateAudio(text, voiceId, config, onStatusUpdate, _retryCount + 1);
            }
            throw new Error(`Gemini TTS failed: ${msg}`);
        }
    }
}

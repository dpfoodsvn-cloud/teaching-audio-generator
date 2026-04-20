import type { TTSEngine, Voice, EngineConfig } from './TTSEngine';

// Popular Edge TTS voices fallback
const EDGE_VOICES_FALLBACK: Voice[] = [
    { id: 'en-US-AriaNeural', name: 'Aria (US)', gender: 'female', language: 'en-US' },
    { id: 'en-US-GuyNeural', name: 'Guy (US)', gender: 'male', language: 'en-US' },
    { id: 'en-US-JennyNeural', name: 'Jenny (US)', gender: 'female', language: 'en-US' },
    { id: 'en-US-MichelleNeural', name: 'Michelle (US)', gender: 'female', language: 'en-US' },
    { id: 'en-US-ChristopherNeural', name: 'Christopher (US)', gender: 'male', language: 'en-US' },
    { id: 'en-US-EricNeural', name: 'Eric (US)', gender: 'male', language: 'en-US' },
    { id: 'en-US-RogerNeural', name: 'Roger (US)', gender: 'male', language: 'en-US' },
    { id: 'en-US-SteffanNeural', name: 'Steffan (US)', gender: 'male', language: 'en-US' },
    { id: 'en-GB-SoniaNeural', name: 'Sonia (UK)', gender: 'female', language: 'en-GB' },
    { id: 'en-GB-RyanNeural', name: 'Ryan (UK)', gender: 'male', language: 'en-GB' },
    { id: 'en-AU-NatashaNeural', name: 'Natasha (AU)', gender: 'female', language: 'en-AU' },
    { id: 'en-AU-WilliamNeural', name: 'William (AU)', gender: 'male', language: 'en-AU' },
    { id: 'en-IN-NeerjaNeural', name: 'Neerja (IN)', gender: 'female', language: 'en-IN' },
    { id: 'en-IN-PrabhatNeural', name: 'Prabhat (IN)', gender: 'male', language: 'en-IN' },
    { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My (VN)', gender: 'female', language: 'vi-VN' },
    { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh (VN)', gender: 'male', language: 'vi-VN' },
    { id: 'ja-JP-NanamiNeural', name: 'Nanami (JP)', gender: 'female', language: 'ja-JP' },
];

export class EdgeTTSEngine implements TTSEngine {
    readonly name = 'Edge TTS (Free)';
    readonly id = 'edge-tts';
    readonly requiresApiKey = false;
    readonly description = '300+ Microsoft neural voices via Local Server';

    async getVoices(): Promise<Voice[]> {
        try {
            const response = await fetch('http://127.0.0.1:5000/api/edge-tts/voices', {
                signal: AbortSignal.timeout(12000)
            });
            if (response.ok) {
                const data = await response.json();
                return data.map((v: any) => ({
                    id: v.ShortName,
                    name: `${v.ShortName.replace(/Neural$/, '')} (${v.Locale})`,
                    gender: (v.Gender || 'unknown').toLowerCase(),
                    language: v.Locale
                }));
            }
        } catch (e) {
            console.warn('Local Edge TTS Backend unavailable, falling back to minimal list:', e);
        }
        return [...EDGE_VOICES_FALLBACK];
    }

    private static activeConnections = 0;
    private static connectionQueue: (() => void)[] = [];
    private static readonly MAX_CONCURRENT = 3;

    private static async acquireConnection(): Promise<void> {
        if (this.activeConnections < this.MAX_CONCURRENT) {
            this.activeConnections++;
            return;
        }
        return new Promise<void>(resolve => {
            this.connectionQueue.push(resolve);
        });
    }

    private static releaseConnection(): void {
        if (this.connectionQueue.length > 0) {
            const next = this.connectionQueue.shift();
            if (next) next();
        } else {
            this.activeConnections = Math.max(0, this.activeConnections - 1);
        }
    }

    private async executeWithRetry(
        executor: () => Promise<Blob>,
        onStatusUpdate?: (message: string) => void,
        maxRetries = 3
    ): Promise<Blob> {
        let lastError: any;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await executor();
            } catch (err: any) {
                lastError = err;
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * attempt, 5000);
                    onStatusUpdate?.(`Proxy Request failed. Retrying (${attempt}/${maxRetries})...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        throw lastError;
    }

    async generateAudio(
        text: string,
        voiceId: string,
        config: EngineConfig,
        onStatusUpdate?: (message: string) => void
    ): Promise<Blob> {
        return this.executeWithRetry(async () => {
            onStatusUpdate?.('Waiting in queue...');
            await EdgeTTSEngine.acquireConnection();

            try {
                return await this._generateAudioInternal(text, voiceId, config, onStatusUpdate);
            } finally {
                EdgeTTSEngine.releaseConnection();
            }
        }, onStatusUpdate);
    }

    private async _generateAudioInternal(
        text: string,
        voiceId: string,
        config: EngineConfig,
        onStatusUpdate?: (message: string) => void
    ): Promise<Blob> {
        onStatusUpdate?.('Requesting from Edge TTS Backend...');

        const ratePercent = config.speed ? Math.round((config.speed - 1) * 100) : 0;
        const pitchHz = config.pitch ? Math.round(config.pitch) : 0;
        const rate = (ratePercent >= 0 ? '+' : '') + ratePercent + '%';
        const pitch = (pitchHz >= 0 ? '+' : '') + pitchHz + 'Hz';

        const response = await fetch('http://127.0.0.1:5000/api/edge-tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                voice: voiceId,
                rate,
                pitch
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Edge TTS Backend failed: ${response.status} - ${errBody}`);
        }

        const blob = await response.blob();
        if (blob.size === 0) {
            throw new Error('Edge TTS Backend returned 0 bytes of audio.');
        }

        return new Blob([blob], { type: 'audio/mp3' });
    }
}

import type { TTSEngine, Voice, EngineConfig } from './TTSEngine';

// Default premade voices (fallback if API key not available)
const DEFAULT_VOICES: Voice[] = [
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female' },
    { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', gender: 'female' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', gender: 'female' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'male' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'male' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male' },
    { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'male' },
    { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi', gender: 'female' },
];

let cachedVoices: Voice[] | null = null;

export class ElevenLabsEngine implements TTSEngine {
    readonly name = 'ElevenLabs';
    readonly id = 'elevenlabs';
    readonly requiresApiKey = true;
    readonly description = '1000+ voices incl. voice clones, free tier available';

    async getVoices(apiKey?: string): Promise<Voice[]> {
        if (cachedVoices) return cachedVoices;
        if (!apiKey) return [...DEFAULT_VOICES];

        try {
            const response = await fetch('https://api.elevenlabs.io/v1/voices', {
                headers: { 'xi-api-key': apiKey },
            });

            if (!response.ok) {
                console.warn('[ElevenLabs] Failed to fetch voices, using defaults');
                return [...DEFAULT_VOICES];
            }

            const data = await response.json();
            cachedVoices = (data.voices || []).map((v: any) => ({
                id: v.voice_id,
                name: v.name,
                gender: v.labels?.gender || 'neutral',
                language: v.labels?.accent || undefined,
            }));
            return cachedVoices!;
        } catch {
            return [...DEFAULT_VOICES];
        }
    }

    async generateAudio(
        text: string,
        voiceId: string,
        config: EngineConfig,
        onStatusUpdate?: (message: string) => void
    ): Promise<Blob> {
        if (!config.apiKey) throw new Error('ElevenLabs API key is required');

        onStatusUpdate?.('Generating with ElevenLabs...');

        const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            {
                method: 'POST',
                headers: {
                    'xi-api-key': config.apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg',
                },
                body: JSON.stringify({
                    text,
                    model_id: config.modelName || 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                    },
                }),
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`ElevenLabs error (${response.status}): ${errText}`);
        }

        const blob = await response.blob();
        return new Blob([blob], { type: 'audio/mpeg' });
    }
}

import type { TTSEngine, Voice, EngineConfig } from './TTSEngine';

const OPENAI_VOICES: Voice[] = [
    { id: 'alloy', name: 'Alloy', gender: 'neutral' },
    { id: 'ash', name: 'Ash', gender: 'male' },
    { id: 'ballad', name: 'Ballad', gender: 'male' },
    { id: 'coral', name: 'Coral', gender: 'female' },
    { id: 'echo', name: 'Echo', gender: 'male' },
    { id: 'fable', name: 'Fable', gender: 'male' },
    { id: 'onyx', name: 'Onyx', gender: 'male' },
    { id: 'nova', name: 'Nova', gender: 'female' },
    { id: 'sage', name: 'Sage', gender: 'female' },
    { id: 'shimmer', name: 'Shimmer', gender: 'female' },
];

export class OpenAIEngine implements TTSEngine {
    readonly name = 'OpenAI TTS';
    readonly id = 'openai';
    readonly requiresApiKey = true;
    readonly description = '10 natural voices, paid API';

    async getVoices(): Promise<Voice[]> {
        return [...OPENAI_VOICES];
    }

    async generateAudio(
        text: string,
        voiceId: string,
        config: EngineConfig,
        onStatusUpdate?: (message: string) => void
    ): Promise<Blob> {
        if (!config.apiKey) throw new Error('OpenAI API key is required');

        onStatusUpdate?.('Generating with OpenAI TTS...');

        const model = config.modelName || 'tts-1';
        const speed = config.speed ?? 1.0;

        const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                input: text,
                voice: voiceId,
                speed: Math.max(0.25, Math.min(4.0, speed)),
                response_format: 'mp3',
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI TTS error (${response.status}): ${errText}`);
        }

        const blob = await response.blob();
        return new Blob([blob], { type: 'audio/mp3' });
    }
}

/**
 * TTSEngine Interface & Shared Types
 * 
 * Any TTS engine can be added by implementing this interface
 * and registering it in the engine registry.
 */

export interface Voice {
    id: string;
    name: string;
    gender?: 'male' | 'female' | 'neutral';
    language?: string;
}

export interface EngineConfig {
    apiKey?: string;
    apiKeys?: string[];
    temperature?: number;
    speed?: number;
    pitch?: number;
    modelName?: string;
    stylePrompt?: string;
}

export interface TTSEngine {
    /** Display name: "Google Gemini" */
    readonly name: string;
    /** Unique ID: "gemini" */
    readonly id: string;
    /** Whether this engine needs an API key */
    readonly requiresApiKey: boolean;
    /** Short description shown in UI */
    readonly description: string;

    /**
     * Get available voices for this engine.
     */
    getVoices(apiKey?: string): Promise<Voice[]>;

    /**
     * Generate audio from text using a specific voice.
     * @returns Audio blob (WAV, MP3, etc.)
     */
    generateAudio(
        text: string,
        voiceId: string,
        config: EngineConfig,
        onStatusUpdate?: (message: string) => void
    ): Promise<Blob>;
}

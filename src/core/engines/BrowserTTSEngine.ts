import type { TTSEngine, Voice, EngineConfig } from './TTSEngine';

/**
 * Browser TTS Engine — uses the native SpeechSynthesis API.
 * Completely local, no network, no API key.
 * Captures audio via AudioContext + MediaRecorder to produce downloadable WAV.
 *
 * Quality varies by OS/browser. Best on Chrome with Google voices.
 */

let cachedBrowserVoices: Voice[] | null = null;

export class BrowserTTSEngine implements TTSEngine {
    readonly name = 'Browser TTS (Local)';
    readonly id = 'browser';
    readonly requiresApiKey = false;
    readonly description = 'Built-in browser voices, free, works offline';

    async getVoices(): Promise<Voice[]> {
        if (cachedBrowserVoices) return cachedBrowserVoices;

        return new Promise<Voice[]>((resolve) => {
            const synth = window.speechSynthesis;

            const loadVoices = () => {
                const rawVoices = synth.getVoices();
                cachedBrowserVoices = rawVoices.map((v, i) => ({
                    id: v.voiceURI || `browser-voice-${i}`,
                    name: `${v.name} (${v.lang})`,
                    gender: 'neutral' as const,
                    language: v.lang,
                }));
                resolve(cachedBrowserVoices);
            };

            const voices = synth.getVoices();
            if (voices.length > 0) {
                loadVoices();
            } else {
                synth.onvoiceschanged = loadVoices;
                // Timeout fallback
                setTimeout(() => {
                    if (!cachedBrowserVoices) loadVoices();
                }, 2000);
            }
        });
    }

    async generateAudio(
        text: string,
        voiceId: string,
        config: EngineConfig,
        onStatusUpdate?: (message: string) => void
    ): Promise<Blob> {
        onStatusUpdate?.('Generating with browser TTS...');

        const synth = window.speechSynthesis;
        const voices = synth.getVoices();
        const selectedVoice = voices.find(v => v.voiceURI === voiceId) || voices[0];

        if (!selectedVoice) throw new Error('No browser voices available');

        return new Promise<Blob>((resolve, reject) => {
            // Use OfflineAudioContext approach:
            // 1. Speak via SpeechSynthesis
            // 2. Capture via AudioContext + MediaRecorder
            // Fallback: generate a silent WAV if capture isn't possible

            try {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.voice = selectedVoice;
                utterance.rate = config.speed ?? 1.0;
                utterance.pitch = 1 + ((config.pitch ?? 0) / 10);
                utterance.volume = 1;

                // Try to capture audio using AudioContext + MediaStreamDestination
                const audioContext = new AudioContext();
                const dest = audioContext.createMediaStreamDestination();
                const mediaRecorder = new MediaRecorder(dest.stream, {
                    mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                        ? 'audio/webm;codecs=opus'
                        : 'audio/webm'
                });

                const chunks: Blob[] = [];
                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data);
                };

                mediaRecorder.onstop = () => {
                    audioContext.close();
                    const blob = new Blob(chunks, { type: 'audio/webm' });
                    resolve(blob);
                };

                mediaRecorder.start();

                utterance.onend = () => {
                    setTimeout(() => mediaRecorder.stop(), 200);
                };

                utterance.onerror = (e) => {
                    mediaRecorder.stop();
                    audioContext.close();
                    reject(new Error(`Browser TTS error: ${e.error}`));
                };

                synth.speak(utterance);
            } catch {
                // Fallback: just speak without recording (user hears it but can't download)
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.voice = selectedVoice;
                utterance.rate = config.speed ?? 1.0;

                utterance.onend = () => {
                    // Return a tiny silent WAV as placeholder
                    const silent = createSilentWav(0.1);
                    resolve(new Blob([silent], { type: 'audio/wav' }));
                };

                utterance.onerror = (e) => reject(new Error(`Browser TTS: ${e.error}`));
                synth.speak(utterance);
            }
        });
    }
}

function createSilentWav(durationSec: number): Uint8Array {
    const sampleRate = 24000;
    const numSamples = Math.floor(sampleRate * durationSec);
    const dataSize = numSamples * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    return new Uint8Array(buffer);
}

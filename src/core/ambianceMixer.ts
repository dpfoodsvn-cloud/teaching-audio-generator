// Ambiance Mixer Utility
// Mixes TTS audio with background ambiance using Web Audio API

export class AmbianceMixer {
    /**
     * Mix TTS audio with ambiance
     * @param ttsBlob - TTS audio blob (WAV)
     * @param ambianceType - Type of ambiance
     * @param ambianceVolume - Volume (0-100)
     * @returns Mixed audio blob
     */
    static async mixAudio(
        ttsBlob: Blob,
        ambianceType: string,
        ambianceVolume: number
    ): Promise<Blob> {
        console.log('[AmbianceMixer] Starting audio mixing...');
        console.log('[AmbianceMixer] Type:', ambianceType, 'Volume:', ambianceVolume);

        // Create audio context
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

        try {
            // Decode TTS audio
            const ttsArrayBuffer = await ttsBlob.arrayBuffer();
            const ttsBuffer = await audioContext.decodeAudioData(ttsArrayBuffer);
            const ttsDuration = ttsBuffer.duration;

            console.log('[AmbianceMixer] TTS duration:', ttsDuration.toFixed(2), 'seconds');

            // Generate ambiance
            const ambianceBuffer = await this.generateAmbiance(audioContext, ambianceType, ttsDuration);

            // Mix audio
            const mixedBuffer = this.mixBuffers(audioContext, ttsBuffer, ambianceBuffer, ambianceVolume / 100);

            // Encode to WAV
            const wavBlob = this.encodeWAV(mixedBuffer);

            console.log('[AmbianceMixer] Mixing complete!');
            return wavBlob;
        } finally {
            await audioContext.close();
        }
    }

    /**
     * Generate ambiance audio
     */
    private static async generateAmbiance(
        audioContext: AudioContext,
        type: string,
        duration: number
    ): Promise<AudioBuffer> {
        const sampleRate = audioContext.sampleRate;
        const length = Math.ceil(duration * sampleRate);
        const buffer = audioContext.createBuffer(2, length, sampleRate);

        const leftChannel = buffer.getChannelData(0);
        const rightChannel = buffer.getChannelData(1);

        switch (type) {
            case 'rain':
                this.generateRain(leftChannel, rightChannel, sampleRate);
                break;
            case 'cafe':
                this.generateCafe(leftChannel, rightChannel, sampleRate);
                break;
            case 'ocean':
                this.generateOcean(leftChannel, rightChannel, sampleRate);
                break;
            case 'forest':
                this.generateForest(leftChannel, rightChannel, sampleRate);
                break;
            case 'fireplace':
                this.generateFireplace(leftChannel, rightChannel, sampleRate);
                break;
            case 'whitenoise':
                this.generateWhiteNoise(leftChannel, rightChannel);
                break;
            default:
                // Silence
                break;
        }

        return buffer;
    }

    /**
     * Generate rain sound (pink noise with droplets)
     */
    private static generateRain(left: Float32Array, right: Float32Array, sampleRate: number) {
        // Pink noise for rain background
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

        for (let i = 0; i < left.length; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;

            // Add occasional droplets
            const droplet = Math.random() < 0.001 ? (Math.random() * 2 - 1) * 0.3 : 0;

            left[i] = (pink + droplet) * 0.4;
            right[i] = (pink + droplet) * 0.4;
        }
    }

    /**
     * Generate cafe ambiance (brown noise with occasional sounds)
     */
    private static generateCafe(left: Float32Array, right: Float32Array, sampleRate: number) {
        // Brown noise for cafe background
        let lastOut = 0;

        for (let i = 0; i < left.length; i++) {
            const white = Math.random() * 2 - 1;
            const brown = (lastOut + (0.02 * white)) / 1.02;
            lastOut = brown;

            // Occasional clinks and murmurs
            const clink = Math.random() < 0.0005 ? (Math.random() * 2 - 1) * 0.2 : 0;

            left[i] = (brown + clink) * 0.3;
            right[i] = (brown + clink) * 0.3;
        }
    }

    /**
     * Generate ocean waves (low-frequency oscillation)
     */
    private static generateOcean(left: Float32Array, right: Float32Array, sampleRate: number) {
        for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            // Low-frequency wave (0.1-0.3 Hz)
            const wave1 = Math.sin(2 * Math.PI * 0.15 * t) * 0.3;
            const wave2 = Math.sin(2 * Math.PI * 0.22 * t) * 0.2;
            // Add some noise for foam
            const foam = (Math.random() * 2 - 1) * 0.1;

            left[i] = (wave1 + wave2 + foam) * 0.4;
            right[i] = (wave1 + wave2 + foam) * 0.4;
        }
    }

    /**
     * Generate forest ambiance (wind + birds)
     */
    private static generateForest(left: Float32Array, right: Float32Array, sampleRate: number) {
        for (let i = 0; i < left.length; i++) {
            const t = i / sampleRate;
            // Wind (low-frequency noise)
            const wind = (Math.random() * 2 - 1) * 0.2 * Math.sin(2 * Math.PI * 0.5 * t);
            // Occasional bird chirps
            const bird = Math.random() < 0.0003 ? Math.sin(2 * Math.PI * 2000 * t) * 0.1 : 0;

            left[i] = (wind + bird) * 0.3;
            right[i] = (wind + bird) * 0.3;
        }
    }

    /**
     * Generate fireplace crackling
     */
    private static generateFireplace(left: Float32Array, right: Float32Array, sampleRate: number) {
        for (let i = 0; i < left.length; i++) {
            // Low rumble
            const rumble = (Math.random() * 2 - 1) * 0.1;
            // Frequent crackles
            const crackle = Math.random() < 0.002 ? (Math.random() * 2 - 1) * 0.4 : 0;

            left[i] = (rumble + crackle) * 0.35;
            right[i] = (rumble + crackle) * 0.35;
        }
    }

    /**
     * Generate white noise
     */
    private static generateWhiteNoise(left: Float32Array, right: Float32Array) {
        for (let i = 0; i < left.length; i++) {
            left[i] = (Math.random() * 2 - 1) * 0.3;
            right[i] = (Math.random() * 2 - 1) * 0.3;
        }
    }

    /**
     * Mix two audio buffers
     */
    private static mixBuffers(
        audioContext: AudioContext,
        ttsBuffer: AudioBuffer,
        ambianceBuffer: AudioBuffer,
        ambianceGain: number
    ): AudioBuffer {
        const length = Math.max(ttsBuffer.length, ambianceBuffer.length);
        const mixedBuffer = audioContext.createBuffer(2, length, ttsBuffer.sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const ttsData = ttsBuffer.getChannelData(channel);
            const ambianceData = ambianceBuffer.getChannelData(channel);
            const mixedData = mixedBuffer.getChannelData(channel);

            for (let i = 0; i < length; i++) {
                const tts = i < ttsData.length ? ttsData[i] : 0;
                const ambiance = i < ambianceData.length ? ambianceData[i] * ambianceGain : 0;
                mixedData[i] = tts + ambiance;
            }
        }

        return mixedBuffer;
    }

    /**
     * Encode AudioBuffer to WAV Blob
     */
    private static encodeWAV(buffer: AudioBuffer): Blob {
        const length = buffer.length * buffer.numberOfChannels * 2;
        const arrayBuffer = new ArrayBuffer(44 + length);
        const view = new DataView(arrayBuffer);

        // WAV header
        const writeString = (offset: number, string: string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, buffer.numberOfChannels, true);
        view.setUint32(24, buffer.sampleRate, true);
        view.setUint32(28, buffer.sampleRate * buffer.numberOfChannels * 2, true);
        view.setUint16(32, buffer.numberOfChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length, true);

        // Write audio data
        let offset = 44;
        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                offset += 2;
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }
}

export class AudioStitcher {
    static async stitchAudio(audioBlobs: Blob[]): Promise<Blob> {
        if (audioBlobs.length === 0) {
            throw new Error('No audio blobs to stitch');
        }

        if (audioBlobs.length === 1) {
            return audioBlobs[0];
        }

        // Use Web Audio API to concatenate
        const audioContext = new AudioContext();
        const audioBuffers: AudioBuffer[] = [];

        // Decode all blobs to audio buffers
        for (let i = 0; i < audioBlobs.length; i++) {
            const blob = audioBlobs[i];
            try {
                const arrayBuffer = await blob.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                audioBuffers.push(audioBuffer);
            } catch (error) {
                console.error(`Error decoding chunk ${i}:`, error);
                throw new Error(`Unable to decode audio data for chunk ${i} (Size: ${blob.size} bytes, Type: ${blob.type}). The audio file from Google might be corrupt or in an unsupported format.`);
            }
        }

        // Calculate total length
        const totalLength = audioBuffers.reduce((sum, buffer) => sum + buffer.length, 0);
        const numberOfChannels = audioBuffers[0].numberOfChannels;
        const sampleRate = audioBuffers[0].sampleRate;

        // Create a new buffer to hold all audio
        const combinedBuffer = audioContext.createBuffer(
            numberOfChannels,
            totalLength,
            sampleRate
        );

        // Copy all buffers into the combined buffer
        let offset = 0;
        for (const buffer of audioBuffers) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const channelData = buffer.getChannelData(channel);
                combinedBuffer.getChannelData(channel).set(channelData, offset);
            }
            offset += buffer.length;
        }

        // Convert back to blob
        const wav = AudioStitcher.audioBufferToWav(combinedBuffer);

        // Clean up
        await audioContext.close();

        return new Blob([wav], { type: 'audio/wav' });
    }

    private static audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
        const numberOfChannels = buffer.numberOfChannels;
        const length = buffer.length * numberOfChannels * 2;
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
        view.setUint16(22, numberOfChannels, true);
        view.setUint32(24, buffer.sampleRate, true);
        view.setUint32(28, buffer.sampleRate * numberOfChannels * 2, true);
        view.setUint16(32, numberOfChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length, true);

        // Write audio data
        const channels: Float32Array[] = [];
        for (let i = 0; i < numberOfChannels; i++) {
            channels.push(buffer.getChannelData(i));
        }

        let offset = 44;
        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, channels[channel][i]));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
                offset += 2;
            }
        }

        return arrayBuffer;
    }
}

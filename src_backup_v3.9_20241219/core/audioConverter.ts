// Audio Converter Utility for WAV to MP3 conversion
// Uses lamejs for MP3 encoding

import lamejs from 'lamejs';

export class AudioConverter {
    /**
     * Convert WAV blob to MP3 blob
     * @param wavBlob - Input WAV audio blob
     * @param bitrate - MP3 bitrate (default: 128 kbps)
     * @returns Promise<Blob> - Output MP3 blob
     */
    static async wavToMp3(wavBlob: Blob, bitrate: number = 128): Promise<Blob> {
        console.log('[AudioConverter] Starting WAV to MP3 conversion...');
        console.log('[AudioConverter] Input size:', (wavBlob.size / 1024 / 1024).toFixed(2), 'MB');

        // Read WAV file as ArrayBuffer
        const arrayBuffer = await wavBlob.arrayBuffer();
        const wav = lamejs.WavHeader.readHeader(new DataView(arrayBuffer));

        const samples = new Int16Array(arrayBuffer, wav.dataOffset, wav.dataLen / 2);
        const sampleRate = wav.sampleRate;
        const channels = wav.channels;

        console.log('[AudioConverter] WAV Info:', {
            sampleRate,
            channels,
            samples: samples.length
        });

        // Initialize MP3 encoder
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);
        const mp3Data: Int8Array[] = [];

        const sampleBlockSize = 1152; // Must be 1152 for MPEG1 Layer3

        if (channels === 1) {
            // Mono
            for (let i = 0; i < samples.length; i += sampleBlockSize) {
                const sampleChunk = samples.subarray(i, i + sampleBlockSize);
                const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
                if (mp3buf.length > 0) {
                    mp3Data.push(mp3buf);
                }
            }
        } else {
            // Stereo - split into left and right channels
            const left: Int16Array[] = [];
            const right: Int16Array[] = [];

            for (let i = 0; i < samples.length; i += sampleBlockSize * 2) {
                const leftChunk: number[] = [];
                const rightChunk: number[] = [];

                for (let j = 0; j < sampleBlockSize && i + j * 2 < samples.length; j++) {
                    leftChunk.push(samples[i + j * 2]);
                    rightChunk.push(samples[i + j * 2 + 1]);
                }

                left.push(new Int16Array(leftChunk));
                right.push(new Int16Array(rightChunk));
            }

            for (let i = 0; i < left.length; i++) {
                const mp3buf = mp3encoder.encodeBuffer(left[i], right[i]);
                if (mp3buf.length > 0) {
                    mp3Data.push(mp3buf);
                }
            }
        }

        // Flush remaining data
        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }

        // Combine all MP3 chunks
        const totalLength = mp3Data.reduce((acc, arr) => acc + arr.length, 0);
        const mp3Uint8 = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of mp3Data) {
            mp3Uint8.set(chunk, offset);
            offset += chunk.length;
        }

        const mp3Blob = new Blob([mp3Uint8], { type: 'audio/mp3' });

        console.log('[AudioConverter] Conversion complete!');
        console.log('[AudioConverter] Output size:', (mp3Blob.size / 1024 / 1024).toFixed(2), 'MB');
        console.log('[AudioConverter] Compression ratio:', ((1 - mp3Blob.size / wavBlob.size) * 100).toFixed(1), '%');

        return mp3Blob;
    }

    /**
     * Estimate MP3 file size from WAV
     * @param wavSize - WAV file size in bytes
     * @param bitrate - Target MP3 bitrate
     * @returns Estimated MP3 size in bytes
     */
    static estimateMp3Size(wavSize: number, bitrate: number = 128): number {
        // Rough estimation: MP3 is typically 10-15% of WAV size at 128kbps
        return Math.floor(wavSize * 0.12);
    }
}

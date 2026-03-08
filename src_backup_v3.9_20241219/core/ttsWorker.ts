import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

export interface TTSConfig {
    apiKey: string;
    apiKeys?: string[]; // Additional API keys for rotation
    modelName: string;
    voiceName: string;
    stylePrompt: string;
    temperature?: number;
    speed?: number;
    pitch?: number;
}

export interface TTSResult {
    chunkIndex: number;
    audioBlob: Blob;
}

export class TTSWorker {
    private static currentKeyIndex = 0;
    private static keyUsageCount: Map<string, number> = new Map();
        private static keyLastUsed: Map<string, number> = new Map();
    private static globalLastUsed: number = 0;
    private static keyCooldowns: Map<string, number> = new Map();

    /**
     * Get the next API key using round-robin rotation
     */
        private static getNextApiKey(config: TTSConfig): string {
        const rawKeys = [config.apiKey, ...(config.apiKeys || [])].filter(k => k && k.trim());
        const allKeys = Array.from(new Set(rawKeys));

        if (allKeys.length === 1) return allKeys[0];

        // Filter out keys that are in cooldown
        const now = Date.now();
        const validKeys = allKeys.filter(key => {
            const cooldown = this.keyCooldowns.get(key) || 0;
            return now >= cooldown;
        });

        if (validKeys.length === 0) {
            console.warn('[API Key Rotation] All keys are in cooldown! Waiting for the earliest one...');
            // Find the key with the earliest expiry
            let minCooldown = Infinity;
            let bestKey = allKeys[0];
            
            for (const key of allKeys) {
                const cooldown = this.keyCooldowns.get(key) || 0;
                if (cooldown < minCooldown) {
                    minCooldown = cooldown;
                    bestKey = key;
                }
            }
            
            // We can either block here or just return the best key (which will trigger a wait in waitForKey or fail and retry)
            // Better to return it, and let the caller handle it, but waitForKey doesn't check cooldowns.
            // Let's just return it. The app might fail, but it will retry.
            // Or we could sleep here? No, async is better.
            // But this function is synchronous.
            // Let's just return the best key.
            return bestKey;
        }

        // Round-robin rotation among VALID keys
        // We need to maintain index relative to ALL keys or VALID keys?
        // If we use valid keys, the index might jump around.
        // Let's just pick the next valid key in the list after the current one.
        
        // Simple approach: just pick random valid key or round robin valid keys
        const key = validKeys[this.currentKeyIndex % validKeys.length];
        this.currentKeyIndex = (this.currentKeyIndex + 1) % validKeys.length;

        this.keyUsageCount.set(key, (this.keyUsageCount.get(key) || 0) + 1);
        console.log(`[API Key Rotation] Using key ...${key.slice(-4)} (used ${this.keyUsageCount.get(key)} times). Available: ${validKeys.length}/${allKeys.length}`);

        return key;
    }
    private static async waitForKey(key: string) {
        // Limit is 3 RPM (1 req / 20s). We use 22s to be safe.
        const minInterval = 22000; 
        const minGlobalInterval = 22000; 
        
        const now = Date.now();
        
        // Global check
        const timeSinceGlobal = now - this.globalLastUsed;
        if (timeSinceGlobal < minGlobalInterval) {
             const waitTime = minGlobalInterval - timeSinceGlobal;
             console.log(`[Rate Limit] Global wait enforced: ${waitTime}ms (Limit: 3 RPM)`);
             await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        // Re-check time after global wait
        const nowAfterGlobal = Date.now();
        const lastUsed = this.keyLastUsed.get(key) || 0;
        const timeSinceLastUse = nowAfterGlobal - lastUsed;

        if (timeSinceLastUse < minInterval) {
            const waitTime = minInterval - timeSinceLastUse;
            console.log(`[Rate Limit] Key ...${key.slice(-4)} needs to wait ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        const finalNow = Date.now();
        this.keyLastUsed.set(key, finalNow);
        this.globalLastUsed = finalNow;
    }

    // Helper to write string to DataView
    private static writeString(view: DataView, offset: number, string: string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    static async generateAudio(
        chunkIndex: number,
        text: string,
        config: TTSConfig,
        onStatusUpdate?: (message: string) => void,
        retryCount = 0,
        retryDelayMs = 20000 // Default to 20s if not provided
    ): Promise<TTSResult> {
        const maxRetries = 10;

        console.log(`[TTS Worker] Starting generation for chunk ${chunkIndex}${retryCount > 0 ? ` (retry ${retryCount}/${maxRetries})` : ''}`);

        const apiKey = this.getNextApiKey(config);
        await this.waitForKey(apiKey);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: config.modelName,
        });

        // Construct style instructions based on config
        const styleParts = [];

        // Inject speed instruction
        if (config.speed) {
            if (config.speed <= 0.7) styleParts.push('Speak very slowly.');
            else if (config.speed < 1.0) styleParts.push('Speak slightly slowly.');
            else if (config.speed > 1.3) styleParts.push('Speak very quickly.');
            else if (config.speed > 1.0) styleParts.push('Speak slightly quickly.');
        }

        // Inject pitch instruction
        if (config.pitch) {
            if (config.pitch <= -5) styleParts.push('Use a very deep and low pitch.');
            else if (config.pitch < 0) styleParts.push('Use a slightly lower pitch.');
            else if (config.pitch >= 5) styleParts.push('Use a very high and excited pitch.');
            else if (config.pitch > 0) styleParts.push('Use a slightly higher pitch.');
        }

        // Inject temperature instruction (Reinforcement)
        if (config.temperature !== undefined) {
            if (config.temperature <= 0.3) styleParts.push('Speak in a very stable and precise tone.');
            else if (config.temperature <= 0.7) styleParts.push('Speak in a clear, natural, and professional tone.');
            else if (config.temperature >= 1.7) styleParts.push('Speak in an extremely dynamic, emotional, and unpredictable tone.');
            else if (config.temperature >= 1.3) styleParts.push('Speak in a highly expressive, varied, and dynamic tone.');
            else styleParts.push('Speak in a natural and balanced tone.');
        }

        // Add user style prompt
        if (config.stylePrompt) {
            styleParts.push(config.stylePrompt);
        }

        const styleInstruction = styleParts.join(' ');

        // Inject style prompt using a structured format
        const fullPrompt = styleInstruction
            ? `${text}`
            : text;

        console.log(`[TTS Worker] Full Prompt: ${fullPrompt}`);
        console.log(`[TTS Worker] Temperature: ${config.temperature ?? 1}`);

        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ];

        try {
            const result = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{ text: fullPrompt }]
                }],
                safetySettings: safetySettings,
                generationConfig: {
                    temperature: config.temperature ?? 1,
                    // @ts-ignore - responseModalities is valid for Gemini 2.5 but missing in types
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: config.voiceName,
                            },
                        },
                    },
                },
            });

            const response = result.response;
            const parts = response.candidates?.[0]?.content?.parts;

            if (!parts || parts.length === 0) {
                throw new Error('No response parts received from API.');
            }

            const audioPart = parts.find(part => part.inlineData?.mimeType?.includes('audio'));

            if (!audioPart || !audioPart.inlineData?.data) {
                throw new Error('No audio data in response.');
            }

            const audioData = audioPart.inlineData.data;
            const mimeType = audioPart.inlineData.mimeType;

            // Convert base64 to Blob
            const binaryString = atob(audioData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            let finalBytes = bytes;
            let finalMimeType = mimeType || 'audio/mp3';

            console.log('[TTS Worker] Received MIME type:', mimeType);

            // Handle Raw PCM (audio/l16) or any non-MP3/WAV audio
            const isPCM = mimeType?.toLowerCase().includes('l16') ||
                mimeType?.toLowerCase().includes('pcm') ||
                (mimeType?.startsWith('audio/') && !mimeType.toLowerCase().includes('mp3') && !mimeType.toLowerCase().includes('wav'));

            if (isPCM) {
                console.log('[TTS Worker] Detected Raw PCM (24kHz). Adding WAV header...');

                const wavHeader = new ArrayBuffer(44);
                const view = new DataView(wavHeader);

                const sampleRate = 24000;
                const numChannels = 1;
                const bitsPerSample = 16;
                const dataSize = bytes.length;

                // RIFF chunk descriptor
                TTSWorker.writeString(view, 0, 'RIFF');
                view.setUint32(4, 36 + dataSize, true);
                TTSWorker.writeString(view, 8, 'WAVE');

                // fmt sub-chunk
                TTSWorker.writeString(view, 12, 'fmt ');
                view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
                view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
                view.setUint16(22, numChannels, true); // NumChannels
                view.setUint32(24, sampleRate, true); // SampleRate
                view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // ByteRate
                view.setUint16(32, numChannels * (bitsPerSample / 8), true); // BlockAlign
                view.setUint16(34, bitsPerSample, true); // BitsPerSample

                // data sub-chunk
                TTSWorker.writeString(view, 36, 'data');
                view.setUint32(40, dataSize, true);

                // Combine header and data
                const headerBytes = new Uint8Array(wavHeader);
                finalBytes = new Uint8Array(headerBytes.length + bytes.length);
                finalBytes.set(headerBytes);
                finalBytes.set(bytes, headerBytes.length);

                finalMimeType = 'audio/wav';
            }

            const audioBlob = new Blob([finalBytes], { type: finalMimeType });

            return {
                chunkIndex,
                audioBlob,
            };
        } catch (error) {
            console.error(`[TTS Worker] âŒ Error generating chunk ${chunkIndex}:`, error);

            // Check if it's a retryable error (Rate Limit, 503, or No Response)
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isRetryable = (
                errorMessage.includes('Rate Limit') ||
                errorMessage.includes('429') ||
                errorMessage.includes('quota') ||
                errorMessage.includes('503') ||
                errorMessage.includes('overloaded') ||
                errorMessage.includes('No response parts') ||
                errorMessage.includes('fetch failed')
            );

            if (isRetryable && retryCount < maxRetries) {
                // Exponential backoff: initialDelay * 2^retryCount
                const baseDelay = Math.max(retryDelayMs, 2000);
                let waitTime = baseDelay * Math.pow(2, retryCount);
                
                // Add jitter
                waitTime += Math.random() * 1000;

                // Cap at 60s (unless API requests more)
                waitTime = Math.min(waitTime, 60000);

                // Check for 429/Quota errors specifically
                const isRateLimit = errorMessage.includes('429') || 
                                  errorMessage.toLowerCase().includes('quota') || 
                                  errorMessage.toLowerCase().includes('rate limit');

                // Try to parse "retry in X s" from error message
                // Matches: "retry in 56.4s", "retry in 60s", etc.
                // Try to parse "retry in X s" from error message
                const retryMatch = errorMessage.match(/retry in\s+([\d.]+)\s*s/i);
                
                if (retryMatch) {
                    const apiDelay = parseFloat(retryMatch[1]) * 1000;
                    console.log(`[TTS Worker] Parsed retry delay from API: ${apiDelay}ms`);
                    waitTime = apiDelay + 2000;
                    
                    // Mark this key as cooled down
                    this.keyCooldowns.set(apiKey, Date.now() + waitTime);
                    console.log(`[Smart Rotation] Key ...${apiKey.slice(-4)} cooldown set for ${Math.round(waitTime/1000)}s`);
                    
                } else if (isRateLimit) {
                    waitTime = Math.max(waitTime, 60000);
                    
                    // Mark this key as cooled down for 60s
                    this.keyCooldowns.set(apiKey, Date.now() + 60000);
                    console.log(`[Smart Rotation] Key ...${apiKey.slice(-4)} cooldown set for 60s (Rate Limit)`);
                }

                const message = `Error: ${errorMessage.substring(0, 50)}... Retrying in ${Math.round(waitTime / 1000)}s... (Attempt ${retryCount + 1}/${maxRetries})`;
                console.log(`[TTS Worker] â³ ${message}`);
                onStatusUpdate?.(message);

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, waitTime));

                // Retry with next API key
                return this.generateAudio(chunkIndex, text, config, onStatusUpdate, retryCount + 1, retryDelayMs);
            }

            if (error instanceof Error) {
                if (error.message.includes('API key')) {
                    throw new Error(`API Key Error: ${error.message}`);
                } else if (error.message.includes('quota') || error.message.includes('rate limit')) {
                    throw new Error(`Rate Limit: ${error.message}. Try adding more API keys or increasing delay.`);
                }
            }

            throw new Error(`Chunk ${chunkIndex} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    static async generateBatch(
        chunks: string[],
        config: TTSConfig,
        concurrency: number,
        delay: number,
        onProgress?: (completed: number, total: number) => void,
        onStatusUpdate?: (message: string) => void,
        signal?: AbortSignal // Added signal
    ): Promise<TTSResult[]> {
        const rawKeys = [config.apiKey, ...(config.apiKeys || [])].filter(k => k && k.trim());
        // Deduplicate keys
        const allKeys = Array.from(new Set(rawKeys));

        console.log(`[TTS Batch] Starting batch generation:`, {
            totalChunks: chunks.length,
            concurrency,
            delayMs: delay,
            model: config.modelName,
            voice: config.voiceName,
            temperature: config.temperature || 1,
            apiKeysAvailable: allKeys.length,
            rotationEnabled: allKeys.length > 1
        });

        if (allKeys.length > 1) {
            console.log(`[TTS Batch] ðŸ”„ API Key Rotation ENABLED - ${allKeys.length} keys available`);
        }

        const results: TTSResult[] = [];
        const queue = chunks.map((chunk, index) => ({ chunk, index }));

        let completed = 0;

        const processChunk = async (item: { chunk: string; index: number }) => {
            if (signal?.aborted) {
                throw new Error('Operation cancelled');
            }

            // Initial pacing delay
            await new Promise(resolve => setTimeout(resolve, delay));

            if (signal?.aborted) {
                throw new Error('Operation cancelled');
            }

            // Pass 'delay' as the retry delay as well
            const result = await TTSWorker.generateAudio(item.index, item.chunk, config, onStatusUpdate, 0, delay);
            results.push(result);
            completed++;
            onProgress?.(completed, chunks.length);
            return result;
        };

        // Process with concurrency limit
        const executing: Promise<any>[] = [];
        for (const item of queue) {
            const promise = processChunk(item);
            executing.push(promise);

            if (executing.length >= concurrency) {
                await Promise.race(executing);
                executing.splice(
                    executing.findIndex(p => p === promise),
                    1
                );
            }
        }

        await Promise.all(executing);

        console.log(`[TTS Batch] âœ… All chunks completed successfully`);

        if (allKeys.length > 1) {
            console.log(`[TTS Batch] ðŸ“Š API Key Usage Stats:`,
                Array.from(this.keyUsageCount.entries()).map(([_, count], idx) =>
                    `Key ${idx + 1}: ${count} requests`
                ).join(', ')
            );
        }

        // Sort by chunk index
        return results.sort((a, b) => a.chunkIndex - b.chunkIndex);
    }
}




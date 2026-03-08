// SSML Helper Utility
// Provides SSML tag validation and builder functions

export class SSMLHelper {
    /**
     * Validate SSML text
     * @param text - Text to validate
     * @returns true if valid SSML or plain text
     */
    static validate(text: string): boolean {
        // Check for unclosed tags
        const openTags = text.match(/<[^/>]+>/g) || [];
        const closeTags = text.match(/<\/[^>]+>/g) || [];

        // Simple validation - just check tag count balance
        return openTags.length >= closeTags.length;
    }

    /**
     * Wrap text with SSML speak tag if not already wrapped
     * @param text - Text to wrap
     * @returns SSML-wrapped text
     */
    static wrapSpeak(text: string): string {
        if (text.trim().startsWith('<speak>')) {
            return text;
        }
        return `<speak>${text}</speak>`;
    }

    /**
     * Add a pause/break
     * @param duration - Duration (e.g., "1s", "500ms")
     * @returns SSML break tag
     */
    static addBreak(duration: string): string {
        return `<break time="${duration}"/>`;
    }

    /**
     * Add emphasis
     * @param text - Text to emphasize
     * @param level - Emphasis level: "strong", "moderate", "reduced"
     * @returns SSML emphasis tag
     */
    static addEmphasis(text: string, level: 'strong' | 'moderate' | 'reduced' = 'moderate'): string {
        return `<emphasis level="${level}">${text}</emphasis>`;
    }

    /**
     * Add prosody (rate, pitch, volume)
     * @param text - Text to modify
     * @param options - Prosody options
     * @returns SSML prosody tag
     */
    static addProsody(
        text: string,
        options: {
            rate?: 'x-slow' | 'slow' | 'medium' | 'fast' | 'x-fast';
            pitch?: 'x-low' | 'low' | 'medium' | 'high' | 'x-high';
            volume?: 'silent' | 'x-soft' | 'soft' | 'medium' | 'loud' | 'x-loud';
        }
    ): string {
        const attrs: string[] = [];
        if (options.rate) attrs.push(`rate="${options.rate}"`);
        if (options.pitch) attrs.push(`pitch="${options.pitch}"`);
        if (options.volume) attrs.push(`volume="${options.volume}"`);

        return `<prosody ${attrs.join(' ')}>${text}</prosody>`;
    }

    /**
     * Add say-as for special pronunciation
     * @param text - Text to pronounce
     * @param interpretAs - How to interpret: "spell-out", "cardinal", "ordinal", "date", "time"
     * @returns SSML say-as tag
     */
    static addSayAs(
        text: string,
        interpretAs: 'spell-out' | 'cardinal' | 'ordinal' | 'date' | 'time' | 'telephone'
    ): string {
        return `<say-as interpret-as="${interpretAs}">${text}</say-as>`;
    }

    /**
     * Strip all SSML tags from text
     * @param text - SSML text
     * @returns Plain text
     */
    static stripTags(text: string): string {
        return text.replace(/<[^>]+>/g, '');
    }

    /**
     * Check if text contains SSML tags
     * @param text - Text to check
     * @returns true if contains SSML tags
     */
    static hasSSML(text: string): boolean {
        return /<[^>]+>/.test(text);
    }

    /**
     * Common SSML templates
     */
    static templates = {
        pause1s: '<break time="1s"/>',
        pause2s: '<break time="2s"/>',
        pause500ms: '<break time="500ms"/>',
        strongEmphasis: (text: string) => `<emphasis level="strong">${text}</emphasis>`,
        slowSpeech: (text: string) => `<prosody rate="slow">${text}</prosody>`,
        fastSpeech: (text: string) => `<prosody rate="fast">${text}</prosody>`,
        spellOut: (text: string) => `<say-as interpret-as="spell-out">${text}</say-as>`,
    };
}

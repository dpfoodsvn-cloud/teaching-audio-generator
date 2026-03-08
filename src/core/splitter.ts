export class TextSplitter {
    static splitText(text: string, maxWords: number = 400): string[] {
        // Split into sentences
        const sentences = text.split(/(?<=[.!?])\s+/);

        const chunks: string[] = [];
        let currentChunk: string[] = [];
        let currentWordCount = 0;

        for (const sentence of sentences) {
            const wordCount = sentence.split(/\s+/).length;

            if (currentWordCount + wordCount > maxWords && currentChunk.length > 0) {
                chunks.push(currentChunk.join(' '));
                currentChunk = [sentence];
                currentWordCount = wordCount;
            } else {
                currentChunk.push(sentence);
                currentWordCount += wordCount;
            }
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk.join(' '));
        }

        return chunks;
    }
}

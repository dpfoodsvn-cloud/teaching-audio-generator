
import fs from 'fs';
import path from 'path';

// Target file is in the current working directory when run
const filePath = path.join(process.cwd(), 'core', 'ttsWorker.ts');
console.log('Target file:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove keyLastUsed update from getNextApiKey
content = content.replace(
    /this\.keyLastUsed\.set\(key, Date\.now\(\)\);/g,
    '// Timestamp updated in waitForKey to ensure accurate rate limiting'
);

// 2. Add waitForKey method
const waitForKeyMethod = `
    private static async waitForKey(key: string) {
        const minInterval = 4000; // 4 seconds (15 RPM)
        const lastUsed = this.keyLastUsed.get(key) || 0;
        const now = Date.now();
        const timeSinceLastUse = now - lastUsed;

        if (timeSinceLastUse < minInterval) {
            const waitTime = minInterval - timeSinceLastUse;
            console.log(\`[Rate Limit] Key ...\${key.slice(-4)} needs to wait \${waitTime}ms\`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        this.keyLastUsed.set(key, Date.now());
    }

    // Helper to write string to DataView
    private static writeString(view: DataView, offset: number, string: string) {`;

content = content.replace(
    /\s+\/\/ Helper to write string to DataView\s+private static writeString\(view: DataView, offset: number, string: string\) {/g,
    waitForKeyMethod
);

// 3. Use waitForKey in generateAudio
content = content.replace(
    /const apiKey = this\.getNextApiKey\(config\);\s+const genAI = new GoogleGenerativeAI\(apiKey\);/g,
    'const apiKey = this.getNextApiKey(config);\n        await this.waitForKey(apiKey);\n        const genAI = new GoogleGenerativeAI(apiKey);'
);

// 4. Implement exponential backoff
const backoffLogic = `
                // Exponential backoff: initialDelay * 2^retryCount
                // Base delay should be at least 2s or user provided delay
                const baseDelay = Math.max(retryDelayMs, 2000);
                let waitTime = baseDelay * Math.pow(2, retryCount);
                
                // Add jitter (0-1000ms) to prevent thundering herd
                waitTime += Math.random() * 1000;

                // Cap at 60s
                waitTime = Math.min(waitTime, 60000);

                // If error specifies a time, use that if it's longer
                const retryMatch = errorMessage.match(/retry in ([\d.]+)s/);
                if (retryMatch) {
                    const apiDelay = parseFloat(retryMatch[1]) * 1000;
                    waitTime = Math.max(waitTime, apiDelay);
                }`;

// Regex to find the old retry logic block
// We look for the start of the block and replace until the end of the if(retryMatch) block
const oldLogicRegex = /\/\/ Use user-provided delay, or extract from error, or default[\s\S]+?waitTime = Math\.max\(waitTime, apiDelay\);\s+}/;

content = content.replace(oldLogicRegex, backoffLogic.trim());

fs.writeFileSync(filePath, content, 'utf8');
console.log('ttsWorker.ts updated successfully');

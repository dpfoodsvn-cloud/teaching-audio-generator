
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'core', 'ttsWorker.ts');
console.log('Target file:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// Improved backoff logic
const newBackoffLogic = `
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

                if (isRateLimit) {
                    // Default to 60s for rate limits if we can't parse the time
                    waitTime = Math.max(waitTime, 60000);
                }

                // Try to parse "retry in X s" from error message
                // Matches: "retry in 56.4s", "retry in 60s", etc.
                const retryMatch = errorMessage.match(/retry in\s+([\d.]+)\s*s/i);
                if (retryMatch) {
                    const apiDelay = parseFloat(retryMatch[1]) * 1000;
                    console.log(\`[TTS Worker] Parsed retry delay from API: \${apiDelay}ms\`);
                    waitTime = Math.max(waitTime, apiDelay + 1000); // Add 1s buffer
                }
`;

// Replace the previous backoff block
// We identify it by the start of the block we added last time
const oldBlockRegex = /\/\/ Exponential backoff: initialDelay \* 2\^retryCount[\s\S]+?waitTime = Math\.max\(waitTime, apiDelay\);\s+}/;

if (oldBlockRegex.test(content)) {
    content = content.replace(oldBlockRegex, newBackoffLogic.trim());
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('ttsWorker.ts updated successfully');
} else {
    console.error('Could not find the code block to replace. Please check the file content.');
    // Fallback: Try to find a unique substring from the previous code
    const fallbackRegex = /const baseDelay = Math\.max\(retryDelayMs, 2000\);[\s\S]+?waitTime = Math\.max\(waitTime, apiDelay\);\s+}/;
    if (fallbackRegex.test(content)) {
        content = content.replace(fallbackRegex, newBackoffLogic.trim());
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('ttsWorker.ts updated successfully (fallback match)');
    } else {
        process.exit(1);
    }
}

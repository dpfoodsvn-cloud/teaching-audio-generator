
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'core', 'ttsWorker.ts');
console.log('Target file:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// 1. Add keyCooldowns map
const cooldownMap = `    private static keyCooldowns: Map<string, number> = new Map();`;
if (!content.includes('private static keyCooldowns')) {
    content = content.replace('private static globalLastUsed: number = 0;', 'private static globalLastUsed: number = 0;\n    private static keyCooldowns: Map<string, number> = new Map();');
}

// 2. Update getNextApiKey
const newGetNextApiKey = `    private static getNextApiKey(config: TTSConfig): string {
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
        console.log(\`[API Key Rotation] Using key ...\${key.slice(-4)} (used \${this.keyUsageCount.get(key)} times). Available: \${validKeys.length}/\${allKeys.length}\`);

        return key;
    }`;

// Replace getNextApiKey
const getNextApiKeyStart = `    private static getNextApiKey(config: TTSConfig): string {`;
const getNextApiKeyEnd = `return key;\n    }`;

// We need to be careful with replacement. The original function ends with `return key;` and a closing brace.
// Let's use a regex to replace the whole function body.
const getNextApiKeyRegex = /private static getNextApiKey\(config: TTSConfig\): string \{[\s\S]+?return key;\s+}/;

if (getNextApiKeyRegex.test(content)) {
    content = content.replace(getNextApiKeyRegex, newGetNextApiKey);
    console.log('getNextApiKey updated');
} else {
    console.error('Could not find getNextApiKey to replace');
}

// 3. Update generateAudio error handling to set cooldowns
// We look for: `if (retryMatch) {`
// And insert the cooldown logic there.

const errorHandlingLogic = `
                // Try to parse "retry in X s" from error message
                const retryMatch = errorMessage.match(/retry in\\s+([\\d.]+)\\s*s/i);
                
                if (retryMatch) {
                    const apiDelay = parseFloat(retryMatch[1]) * 1000;
                    console.log(\`[TTS Worker] Parsed retry delay from API: \${apiDelay}ms\`);
                    waitTime = apiDelay + 2000;
                    
                    // Mark this key as cooled down
                    this.keyCooldowns.set(apiKey, Date.now() + waitTime);
                    console.log(\`[Smart Rotation] Key ...\${apiKey.slice(-4)} cooldown set for \${Math.round(waitTime/1000)}s\`);
                    
                } else if (isRateLimit) {
                    waitTime = Math.max(waitTime, 60000);
                    
                    // Mark this key as cooled down for 60s
                    this.keyCooldowns.set(apiKey, Date.now() + 60000);
                    console.log(\`[Smart Rotation] Key ...\${apiKey.slice(-4)} cooldown set for 60s (Rate Limit)\`);
                }
`;

// Replace the existing block
const oldErrorLogicRegex = /const retryMatch = errorMessage\.match\(\/retry in\\s\+\(\[\\d\.\]\+\)\\s\*s\/i\);[\s\S]+?\}\s*else if \(isRateLimit\) \{[\s\S]+?waitTime = Math\.max\(waitTime, 60000\);\s+\}/;

// The regex might be tricky due to escaping. Let's try to match the exact string block if possible.
// Or use anchors.

const startAnchor = `const retryMatch = errorMessage.match(/retry in\\s+([\\d.]+)\\s*s/i);`;
const endAnchor = `waitTime = Math.max(waitTime, 60000);\n                }`;

const startIndex = content.indexOf(startAnchor);
const endIndex = content.indexOf(endAnchor);

if (startIndex !== -1 && endIndex !== -1) {
    const lengthOfEnd = endAnchor.length;
    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex + lengthOfEnd);

    // We need to reconstruct the middle part with our new logic
    // But wait, my new logic REPLACES the `if (retryMatch) ... else if ...` block.
    // The `startAnchor` is the line BEFORE the block starts (or the start of it).
    // The `endAnchor` is the end of the `else if`.

    // My new logic starts with `// Try to parse...` which includes the startAnchor line.
    // So I can just replace the whole chunk.

    content = before + errorHandlingLogic.trim() + after;
    console.log('Error handling updated with cooldown logic');
} else {
    console.error('Could not find error handling logic to replace');
    console.log('Start index:', startIndex);
    console.log('End index:', endIndex);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('ttsWorker.ts updated successfully');

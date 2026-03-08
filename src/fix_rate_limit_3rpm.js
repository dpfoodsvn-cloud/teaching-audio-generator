
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'core', 'ttsWorker.ts');
console.log('Target file:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// New waitForKey method with 22s delay
const newWaitForKey = `
    private static async waitForKey(key: string) {
        // Limit is 3 RPM (1 req / 20s). We use 22s to be safe.
        const minInterval = 22000; 
        const minGlobalInterval = 22000; 
        
        const now = Date.now();
        
        // Global check
        const timeSinceGlobal = now - this.globalLastUsed;
        if (timeSinceGlobal < minGlobalInterval) {
             const waitTime = minGlobalInterval - timeSinceGlobal;
             console.log(\`[Rate Limit] Global wait enforced: \${waitTime}ms (Limit: 3 RPM)\`);
             await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        // Re-check time after global wait
        const nowAfterGlobal = Date.now();
        const lastUsed = this.keyLastUsed.get(key) || 0;
        const timeSinceLastUse = nowAfterGlobal - lastUsed;

        if (timeSinceLastUse < minInterval) {
            const waitTime = minInterval - timeSinceLastUse;
            console.log(\`[Rate Limit] Key ...\${key.slice(-4)} needs to wait \${waitTime}ms\`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        const finalNow = Date.now();
        this.keyLastUsed.set(key, finalNow);
        this.globalLastUsed = finalNow;
    }
`;

// Regex to replace the existing waitForKey method
const oldMethodRegex = /private static async waitForKey\(key: string\) \{[\s\S]+?this\.globalLastUsed = finalNow;\s+}/;

if (oldMethodRegex.test(content)) {
    content = content.replace(oldMethodRegex, newWaitForKey.trim());
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('ttsWorker.ts updated successfully');
} else {
    console.error('Could not find waitForKey method to replace');
    // Fallback: try to match the previous version specifically
    const fallbackRegex = /private static async waitForKey\(key: string\) \{[\s\S]+?this\.globalLastUsed = finalNow;\s+}/;
    // Actually the regex above is generic enough.
    // Let's try to match the start of the function and the end.

    // Debug: print a chunk
    const start = content.indexOf('private static async waitForKey(key: string) {');
    if (start !== -1) {
        console.log('Found start at', start);
    }
    process.exit(1);
}

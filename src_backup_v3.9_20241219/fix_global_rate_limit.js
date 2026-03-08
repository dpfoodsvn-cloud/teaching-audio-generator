
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'core', 'ttsWorker.ts');
console.log('Target file:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// 1. Add globalLastUsed property
// We'll add it after keyLastUsed
const globalProp = `    private static keyLastUsed: Map<string, number> = new Map();
    private static globalLastUsed: number = 0;`;

content = content.replace(
    /private static keyLastUsed: Map<string, number> = new Map\(\);/,
    globalProp
);

// 2. Update waitForKey method
const newWaitForKey = `
    private static async waitForKey(key: string) {
        const minInterval = 4000; // 4 seconds (15 RPM) per key
        const minGlobalInterval = 5000; // 5 seconds global (12 RPM total) to be safe
        
        const now = Date.now();
        
        // Global check
        const timeSinceGlobal = now - this.globalLastUsed;
        if (timeSinceGlobal < minGlobalInterval) {
             const waitTime = minGlobalInterval - timeSinceGlobal;
             console.log(\`[Rate Limit] Global wait enforced: \${waitTime}ms\`);
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
// It starts with private static async waitForKey(key: string) {
// and ends before the helper method
const oldMethodRegex = /private static async waitForKey\(key: string\) \{[\s\S]+?this\.keyLastUsed\.set\(key, Date\.now\(\)\);\s+}/;

if (oldMethodRegex.test(content)) {
    content = content.replace(oldMethodRegex, newWaitForKey.trim());
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('ttsWorker.ts updated successfully');
} else {
    console.error('Could not find waitForKey method to replace');
    process.exit(1);
}

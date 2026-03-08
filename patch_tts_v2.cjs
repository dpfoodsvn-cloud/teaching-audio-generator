const fs = require('fs');
const path = 'src/core/ttsWorker.ts';
let content = fs.readFileSync(path, 'utf8');

const newMethod = \    private static async waitForKey(key: string) {
        const minInterval = 4000; 
        const minGlobalInterval = 1100; // 1.1s to be safe
        
        const now = Date.now();
        
        // Preschedule global slot to ensure strict pacing and no bursts
        let targetGlobalTime = this.globalLastUsed + minGlobalInterval;
        if (targetGlobalTime < now) {
            targetGlobalTime = now;
        }

        const globalWait = targetGlobalTime - now;
        this.globalLastUsed = targetGlobalTime;

        if (globalWait > 0) {
             await new Promise(resolve => setTimeout(resolve, globalWait));
        }
        
        // Check per-key limit
        const lastUsed = this.keyLastUsed.get(key) || 0;
        const currentNow = Date.now();
        const timeSinceLastUse = currentNow - lastUsed;

        if (timeSinceLastUse < minInterval) {
            const waitTime = minInterval - timeSinceLastUse;
            console.log('Rate Limit per key wait: ' + waitTime);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        const finalNow = Date.now();
        this.keyLastUsed.set(key, finalNow);
    }\;

const regex = /private static async waitForKey\(key: string\) \{[\\s\\S]+?this\\.globalLastUsed = finalNow;\\s+}/;

if (regex.test(content)) {
    content = content.replace(regex, newMethod);
    fs.writeFileSync(path, content);
    console.log('Patched waitForKey with strict pacing');
} else {
    console.error('Could not find waitForKey to replace');
    // Debug
    // console.log(content.substring(0, 1000));
}


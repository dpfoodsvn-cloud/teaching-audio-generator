const fs = require('fs');
const path = 'src/core/ttsWorker.ts';
let content = fs.readFileSync(path, 'utf8');

const newRetryLogic = \} else if (isRateLimit) {
                    // Mark this key as cooled down for 60s
                    this.keyCooldowns.set(apiKey, Date.now() + 60000);
                    console.log(\\\[Smart Rotation] Key ...\\\ cooldown set for 60s (Rate Limit)\\\);

                    // Check if we have other keys available
                    const rawKeys = [config.apiKey, ...(config.apiKeys || [])].filter(k => k && k.trim());
                    const allKeys = Array.from(new Set(rawKeys));
                    
                    const now = Date.now();
                    const availableKeys = allKeys.filter(key => {
                        const cooldown = this.keyCooldowns.get(key) || 0;
                        return now >= cooldown;
                    });

                    if (availableKeys.length > 0) {
                        console.log(\\\[Smart Rotation] Switching to next available key immediately (\\\ available)\\\);
                        waitTime = 1000; // Minimal wait to switch keys
                    } else {
                         waitTime = Math.max(waitTime, 60000);
                         console.log('[Smart Rotation] All keys exhausted, waiting full duration');
                    }
                }\;

// Match the specific logic to replace
// Note: We use [\s\S] to match newlines
const regex = /} else if \(isRateLimit\) \{[\s\S]+?\(Rate Limit\)\);[\s\S]+?\}/;

if (regex.test(content)) {
     content = content.replace(regex, newRetryLogic);
     fs.writeFileSync(path, content);
     console.log('Patched retry logic for fast rotation');
} else {
    console.error('Could not find retry logic block');
    const start = content.indexOf('const isRateLimit = errorMessage.includes');
    console.log(content.substring(start, start+1000));
}


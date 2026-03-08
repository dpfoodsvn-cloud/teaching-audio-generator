const fs = require('fs');
const path = 'src/core/ttsWorker.ts';
let content = fs.readFileSync(path, 'utf8');

const newRetryLogic = \                } else if (isRateLimit) {
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

// Match the specific block to replace
const oldLogic = /} else if \\(isRateLimit\\) {\\s+waitTime = Math.max\\(waitTime, 60000\\);\\s+\\/\/ Mark this key as cooled down for 60s\\s+this.keyCooldowns.set\\(apiKey, Date.now\\(\\) \\+ 60000\\);\\s+console.log\\(\\\\\[Smart Rotation\\] Key ...\\\ cooldown set for 60s \\(Rate Limit\\)\\\\\);\\s+}/;

// We need to match loosely because of whitespace potentially
// Let's try matching just the inner part
const startStr = '} else if (isRateLimit) {';
const endStr = 'console.log([Smart Rotation] Key ... cooldown set for 60s (Rate Limit));';

if (content.indexOf(startStr) !== -1 && content.indexOf(endStr) !== -1) {
    // We'll replace the block manually using string manipulation to be safe
    // Actually, I can use a simpler replacement if I target the 'if (isRateLimit)' block
    
    // Let's replace the whole 'else if (isRateLimit) { ... }' block
    // The previous block ends with:
    // } else if (isRateLimit) {
    //    waitTime = Math.max(waitTime, 60000);
    //
    //    // Mark this key as cooled down for 60s
    //    this.keyCooldowns.set(apiKey, Date.now() + 60000);
    //    console.log(\[Smart Rotation] Key ...\ cooldown set for 60s (Rate Limit)\);
    // }
    
     content = content.replace(/} else if \\(isRateLimit\\) {[\\s\\S]+?Rate Limit\\)\\\\);\\s+}/, newRetryLogic);
     fs.writeFileSync(path, content);
     console.log('Patched retry logic for fast rotation');
} else {
    console.error('Could not find retry logic block');
    // console.log(content.substring(content.indexOf('isRateLimit'), content.indexOf('isRateLimit') + 500));
}


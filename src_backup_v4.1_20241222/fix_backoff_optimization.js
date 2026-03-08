
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'core', 'ttsWorker.ts');
console.log('Target file:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// Optimized logic to insert
const optimizedLogic = `
                // Check for 429/Quota errors specifically
                const isRateLimit = errorMessage.includes('429') || 
                                  errorMessage.toLowerCase().includes('quota') || 
                                  errorMessage.toLowerCase().includes('rate limit');

                // Try to parse "retry in X s" from error message
                // Matches: "retry in 56.4s", "retry in 60s", etc.
                const retryMatch = errorMessage.match(/retry in\\s+([\\d.]+)\\s*s/i);
                
                if (retryMatch) {
                    const apiDelay = parseFloat(retryMatch[1]) * 1000;
                    console.log(\`[TTS Worker] Parsed retry delay from API: \${apiDelay}ms\`);
                    // Use API delay + 2s buffer, ignore the 60s default
                    waitTime = apiDelay + 2000;
                } else if (isRateLimit) {
                    // Default to 60s for rate limits ONLY if we can't parse the time
                    waitTime = Math.max(waitTime, 60000);
                }
`;

// Simplified Anchors
const startAnchor = `// Check for 429/Quota errors specifically`;
// Use a very short, unique anchor for the end
const endAnchor = `const message = \`Error: \${errorMessage.substring(0, 50)}`;

const startIndex = content.indexOf(startAnchor);
const endIndex = content.indexOf(endAnchor);

console.log('Start Anchor:', startAnchor);
console.log('End Anchor:', endAnchor);
console.log('Start Index:', startIndex);
console.log('End Index:', endIndex);

if (startIndex !== -1 && endIndex !== -1) {
    console.log('Found anchors, replacing block...');
    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex);

    // We need to make sure we don't duplicate the start anchor since it's part of the optimized logic
    // The optimizedLogic starts with the startAnchor text (comment).
    // So we should replace from startIndex to endIndex.

    // Actually, optimizedLogic *contains* the startAnchor text.
    // So `before + optimizedLogic + after` works if `before` ends right before startAnchor.
    // `before` = content[0...startIndex] -> excludes startAnchor.
    // `optimizedLogic` starts with `// Check ...`
    // `after` = content[endIndex...] -> starts with `const message ...`

    // But wait, `optimizedLogic` has newlines at start.
    // Let's trim it.

    const finalContent = before + optimizedLogic.trim() + '\n\n                ' + after;
    fs.writeFileSync(filePath, finalContent, 'utf8');
    console.log('ttsWorker.ts updated successfully');
} else {
    console.error('Could not find anchors');
    // Dump a snippet around where we expect it
    const approximateLoc = content.indexOf('errorMessage.includes(\'429\')');
    if (approximateLoc !== -1) {
        console.log('Snippet around 429 check:\n', content.substring(approximateLoc - 100, approximateLoc + 200));
    }
    process.exit(1);
}

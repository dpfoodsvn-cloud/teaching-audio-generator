
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'App.tsx');
console.log('Target file:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// Logic to replace:
// const filename = `${String(processedCount + 1).padStart(3, '0')}_${safeSpeaker}_${safeText}.${extension}`;

// New logic:
const newFilenameLogic = `
                // Create meaningful filename
                // Check if segment.id is a custom ID (not a UUID)
                const isCustomId = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment.id);
                
                let filename: string;
                if (isCustomId) {
                    // Use the custom ID
                    const safeId = segment.id.replace(/[^a-zA-Z0-9-_]/g, '_');
                    filename = \`\${safeId}.\${extension}\`;
                } else {
                    // Fallback to counter for auto-generated IDs
                    const firstLine = segment.lines[0];
                    const safeSpeaker = firstLine ? firstLine.speaker.replace(/[^a-zA-Z0-9]/g, '_') : 'Unknown';
                    const safeText = firstLine ? firstLine.text.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_') : 'audio';
                    filename = \`\${String(processedCount + 1).padStart(3, '0')}_\${safeSpeaker}_\${safeText}.\${extension}\`;
                }
`;

// We need to find the block to replace.
// It starts with `// Create meaningful filename:` and ends with `const filename = ...`

const startAnchor = `// Create meaningful filename: 001_Speaker_TextSnippet.ext`;
const endAnchor = `const filename = \`\${String(processedCount + 1).padStart(3, '0')}_\${safeSpeaker}_\${safeText}.\${extension}\`;`;

const startIndex = content.indexOf(startAnchor);
const endIndex = content.indexOf(endAnchor);

if (startIndex !== -1 && endIndex !== -1) {
    const lengthOfEnd = endAnchor.length;
    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex + lengthOfEnd);

    content = before + newFilenameLogic.trim() + after;
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('App.tsx updated successfully');
} else {
    console.error('Could not find filename logic to replace');
    // Fallback: try to match just the line
    const fallbackStart = content.indexOf(`const filename = \`\${String(processedCount + 1).padStart(3, '0')}`);
    if (fallbackStart !== -1) {
        // This is risky without end anchor, but let's try to find the end of that line
        const fallbackEnd = content.indexOf(';', fallbackStart);
        if (fallbackEnd !== -1) {
            const before = content.substring(0, fallbackStart);
            // We also want to remove the lines before it that calculate safeSpeaker/safeText if they are not used?
            // Actually, the new logic re-declares them inside the else block.
            // So we should remove the previous declarations of safeSpeaker and safeText to avoid "unused variable" or "redeclaration" issues if they were outside?
            // In the original code:
            /*
                const firstLine = segment.lines[0];
                const safeSpeaker = ...
                const safeText = ...
                const filename = ...
            */
            // My new logic puts them in `else`.
            // So I should replace the whole block starting from `const firstLine = ...`

            const blockStart = content.indexOf(`const firstLine = segment.lines[0];`);
            if (blockStart !== -1) {
                const beforeBlock = content.substring(0, blockStart);
                const afterBlock = content.substring(fallbackEnd + 1);
                content = beforeBlock + newFilenameLogic.trim() + afterBlock;
                fs.writeFileSync(filePath, content, 'utf8');
                console.log('App.tsx updated successfully (fallback block match)');
                process.exit(0);
            }
        }
    }

    console.log('Start index:', startIndex);
    console.log('End index:', endIndex);
    process.exit(1);
}


import fs from 'fs';
import path from 'path';

// Target file is in the current working directory when run
const filePath = path.join(process.cwd(), 'App.tsx');
console.log('Target file:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: Local AbortController
content = content.replace(
    /abortControllerRef\.current = new AbortController\(\);/g,
    'const controller = new AbortController();\n        abortControllerRef.current = controller;'
);

content = content.replace(
    /if \(abortControllerRef\.current\?\.signal\.aborted\) break;/g,
    'if (controller.signal.aborted) break;'
);

content = content.replace(
    /abortControllerRef\.current\.signal/g,
    'controller.signal'
);

// Fix 2: Meaningful Filenames
const filenameReplacement = `
                // Create meaningful filename: 001_Speaker_TextSnippet.ext
                const firstLine = segment.lines[0];
                const safeSpeaker = firstLine ? firstLine.speaker.replace(/[^a-zA-Z0-9]/g, '_') : 'Unknown';
                const safeText = firstLine ? firstLine.text.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_') : 'audio';
                const filename = \`\${String(processedCount + 1).padStart(3, '0')}_\${safeSpeaker}_\${safeText}.\${extension}\`;
`;

// Use a more flexible regex for the filename replacement to handle potential whitespace variations
// The original line: const filename = `${segment.id}.${extension}`;
content = content.replace(
    /const\s+filename\s*=\s*`\${segment\.id}\.\${extension}`;/g,
    filenameReplacement.trim()
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('App.tsx updated successfully');

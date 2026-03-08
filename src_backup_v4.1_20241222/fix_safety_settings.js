
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'core', 'ttsWorker.ts');
console.log('Target file:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// 1. Update Imports
// import { GoogleGenerativeAI } from '@google/generative-ai';
// -> import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

if (!content.includes('HarmCategory')) {
    content = content.replace(
        "import { GoogleGenerativeAI } from '@google/generative-ai';",
        "import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';"
    );
    console.log('Imports updated');
}

// 2. Add Safety Settings and update generateContent
// We need to find where `model.generateContent` is called and inject safetySettings.

const safetySettingsLogic = `
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ];

        try {
            const result = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{ text: fullPrompt }]
                }],
                safetySettings: safetySettings,
                generationConfig: {
`;

// Anchor: `try {` followed by `const result = await model.generateContent({`
// The original code:
/*
        try {
            const result = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{ text: fullPrompt }]
                }],
                generationConfig: {
*/

const startAnchor = `try {
            const result = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{ text: fullPrompt }]
                }],
                generationConfig: {`;

// We want to insert `safetySettings: safetySettings,` before `generationConfig`.
// And we need to define `safetySettings` before the `try` block.

// Let's replace the whole block from `console.log(\`[TTS Worker] Temperature: \${config.temperature ?? 1}\`);`
// down to `generationConfig: {`

const blockStartAnchor = `console.log(\`[TTS Worker] Temperature: \${config.temperature ?? 1}\`);`;
const blockEndAnchor = `generationConfig: {`;

const startIndex = content.indexOf(blockStartAnchor);
const endIndex = content.indexOf(blockEndAnchor);

if (startIndex !== -1 && endIndex !== -1) {
    const before = content.substring(0, startIndex + blockStartAnchor.length);
    const after = content.substring(endIndex); // Keep generationConfig: { and everything after

    // We insert the safety settings definition and the updated generateContent call start
    const newBlock = `

        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ];

        try {
            const result = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{ text: fullPrompt }]
                }],
                safetySettings: safetySettings,
                `;

    // We need to be careful about what we are replacing.
    // The `before` includes the console log.
    // The `after` starts with `generationConfig: {`.
    // The original code between them was:
    /*
    
        try {
            const result = await model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [{ text: fullPrompt }]
                }],
    */

    content = before + newBlock + after;
    console.log('Safety settings added');
} else {
    console.error('Could not find generateContent block to replace');
    console.log('Start index:', startIndex);
    console.log('End index:', endIndex);
    process.exit(1);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('ttsWorker.ts updated successfully');

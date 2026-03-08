
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'App.tsx');
console.log('Target file:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// 1. Add stripRtf helper function
const stripRtfFunction = `
// Helper to strip RTF formatting
const stripRtf = (rtf: string): string => {
    let text = rtf;
    text = text.replace(/\\\\[a-z]+(-?[0-9]+)? ?/g, ' ');
    text = text.replace(/[{}]/g, '');
    text = text.replace(/\\\\'([0-9a-fA-F]{2})/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
    });
    text = text.replace(/\\s+/g, ' ').trim();
    return text;
};

function App() {`;

if (!content.includes('const stripRtf = (rtf: string): string => {')) {
    content = content.replace('function App() {', stripRtfFunction);
}

// 2. Update handleFileSelect
const newHandleFileSelect = `const handleFileSelect = async (selectedFile: File) => {
        setFile(selectedFile);
        const nameWithoutExt = selectedFile.name.replace(/\\.[^/.]+$/, "");
        setFileName(nameWithoutExt);

        let text = '';
        if (selectedFile.name.toLowerCase().endsWith('.rtf')) {
            const rtfContent = await selectedFile.text();
            text = stripRtf(rtfContent);
        } else {
            // .txt, .md, etc.
            text = await selectedFile.text();
        }

        const parsedSegments = ScriptParser.parse(text);
        setSegments(parsedSegments);
        setTotal(parsedSegments.length);

        const uniqueSpeakers = new Set<string>();
        parsedSegments.forEach(seg => {
            seg.lines.forEach(line => uniqueSpeakers.add(line.speaker));
        });
        const speakerList = Array.from(uniqueSpeakers);
        setSpeakers(speakerList);`;

const startAnchor = `const handleFileSelect = async (selectedFile: File) => {`;
const endAnchor = `setSpeakers(speakerList);`;

const startIndex = content.indexOf(startAnchor);
const endIndex = content.indexOf(endAnchor);

if (startIndex !== -1 && endIndex !== -1) {
    // We replace from startAnchor to endAnchor + length of endAnchor
    // This covers the entire function body up to the last statement.
    // The closing brace `};` is AFTER endAnchor in the original file.
    // Our new code DOES NOT include `};` at the end, so we preserve the original closing brace.

    const lengthOfEnd = endAnchor.length;
    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex + lengthOfEnd);

    content = before + newHandleFileSelect + after;
    console.log('handleFileSelect updated');
} else {
    console.error('Could not find handleFileSelect anchors');
    console.log('Start index:', startIndex);
    console.log('End index:', endIndex);
    process.exit(1);
}

// 3. Update input accept attribute
if (content.includes('accept=".txt"')) {
    content = content.replace('accept=".txt"', 'accept=".txt,.md,.rtf"');
}

// 4. Update helper text
if (content.includes('or click to select a .txt file')) {
    content = content.replace('or click to select a .txt file', 'or click to select a .txt, .md, or .rtf file');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('App.tsx updated successfully');


import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'App.tsx');
console.log('Target file:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// New Voice Mapping Logic
const newMappingLogic = `
        // Smart Voice Mapping with Collision Avoidance
        const usedVoices = new Set<string>();
        
        // Counters for fallback rotation
        let maleCounter = 0;
        let femaleCounter = 0;
        let neutralCounter = 0;

        speakerList.forEach((speaker) => {
            const gender = detectGender(speaker);
            let candidates: string[] = [];
            
            if (gender === 'female') candidates = FEMALE_VOICES;
            else if (gender === 'male') candidates = MALE_VOICES;
            else candidates = voices; // All voices for unknown

            // 1. Try to find an unused voice from candidates
            let assignedVoice = candidates.find(v => !usedVoices.has(v));

            // 2. Fallback: If all candidates used, rotate
            if (!assignedVoice) {
                if (gender === 'female') {
                    assignedVoice = FEMALE_VOICES[femaleCounter % FEMALE_VOICES.length];
                    femaleCounter++;
                } else if (gender === 'male') {
                    assignedVoice = MALE_VOICES[maleCounter % MALE_VOICES.length];
                    maleCounter++;
                } else {
                    assignedVoice = voices[neutralCounter % voices.length];
                    neutralCounter++;
                }
            }

            // Mark as used
            usedVoices.add(assignedVoice);
            initialMapping[speaker] = assignedVoice;
        });
`;

// Anchor: The block starting with `// Track used voices to avoid repetition if possible`
// and ending with `initialMapping[speaker] = assignedVoice;` inside the loop.

// The original code structure:
/*
        // Track used voices to avoid repetition if possible
        let usedMaleVoices = 0;
        let usedFemaleVoices = 0;
        let usedNeutralVoices = 0;

        speakerList.forEach((speaker) => {
            const gender = detectGender(speaker);
            let assignedVoice = '';

            if (gender === 'female') {
                assignedVoice = FEMALE_VOICES[usedFemaleVoices % FEMALE_VOICES.length];
                usedFemaleVoices++;
            } else if (gender === 'male') {
                assignedVoice = MALE_VOICES[usedMaleVoices % MALE_VOICES.length];
                usedMaleVoices++;
            } else {
                // For unknown, alternate between available pools or just use main list
                assignedVoice = voices[usedNeutralVoices % voices.length];
                usedNeutralVoices++;
            }
            initialMapping[speaker] = assignedVoice;
        });
*/

const startAnchor = `// Track used voices to avoid repetition if possible`;
const endAnchor = `initialMapping[speaker] = assignedVoice;`;

const startIndex = content.indexOf(startAnchor);
const endIndex = content.indexOf(endAnchor);

if (startIndex !== -1 && endIndex !== -1) {
    // We need to find the closing brace of the forEach loop to replace correctly?
    // The endAnchor is inside the loop.
    // The loop ends with `});`.

    // Let's find `});` after endAnchor.
    const loopEndIndex = content.indexOf('});', endIndex);

    if (loopEndIndex !== -1) {
        const before = content.substring(0, startIndex);
        const after = content.substring(loopEndIndex + 3); // +3 for `});`

        content = before + newMappingLogic.trim() + after;
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('App.tsx updated successfully');
    } else {
        console.error('Could not find loop end');
    }
} else {
    console.error('Could not find voice mapping logic to replace');
    console.log('Start index:', startIndex);
    console.log('End index:', endIndex);
    process.exit(1);
}

const fs = require('fs');
const p = 'c:/Users/User/.gemini/antigravity/brain/da5f3e20-f8e7-4ace-b47e-d55431afb841/Teaching App/src/App.tsx';
let c = fs.readFileSync(p, 'utf8');
if (c.includes('parseSpeakerGenders')) {
  console.log('Already exists');
} else {
  const fn = 
        // Parse speaker genders from SPEAKERS header
        const parseSpeakerGenders = (speakerLine) => {
            const genders = {};
            const m = speakerLine.match(/\\(([^)]+)\\)/);
            if (!m) return { genders, error: 'No speaker details' };
            const parts = m[1].split(';');
            for (const part of parts) {
                const trimmed = part.trim();
                const idx = trimmed.indexOf(',');
                if (idx === -1) continue;
                const name = trimmed.substring(0, idx).trim();
                const desc = trimmed.substring(idx + 1).toLowerCase();
                if (desc.includes('male') && !desc.includes('female')) genders[name] = 'male';
                else if (desc.includes('female')) genders[name] = 'female';
                else genders[name] = 'unknown';
            }
            console.log('[Parser] Extracted genders:', genders);
            return { genders };
        };
;
  c = c.replace('// Check if content has SCRIPT ID format', '// Parse genders from SPEAKERS header' + fn + '\n        // Check if content has SCRIPT ID format');
  fs.writeFileSync(p, c);
  console.log('Added parseSpeakerGenders!');
}

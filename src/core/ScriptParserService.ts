import { ScriptSegment } from './types';

export class ScriptParser {
    static parse(content: string): ScriptSegment[] {
        const segments: ScriptSegment[] = [];
        const lines = content.split(/\r?\n/);

        let currentSegment: ScriptSegment | null = null;
        let captureDialogue = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (!line) continue;

            // Check for new Script ID
            if (line.startsWith('SCRIPT ID:')) {
                // Save previous segment if exists
                if (currentSegment) {
                    segments.push(currentSegment);
                }

                // Start new segment
                currentSegment = {
                    id: line.replace('SCRIPT ID:', '').trim(),
                    section: '',
                    name: '',
                    lines: []
                };
                captureDialogue = false;
                continue;
            }

            if (currentSegment) {
                if (line.startsWith('SECTION:')) {
                    currentSegment.section = line.replace('SECTION:', '').trim();
                } else if (line.startsWith('NAME:')) {
                    currentSegment.name = line.replace('NAME:', '').trim();
                } else if (line.startsWith('DURATION:')) {
                    currentSegment.duration = line.replace('DURATION:', '').trim();
                } else if (line.startsWith('SPEAKERS:')) {
                    currentSegment.speakerCount = line.replace('SPEAKERS:', '').trim();
                } else if (line.includes('──────')) {
                    // Separator line indicates end of metadata and start of dialogue
                    captureDialogue = true;
                } else if (captureDialogue) {
                    // Parse dialogue: \"Speaker: Text\"
                    const match = line.match(/^([^:]+):\s*(.+)$/);

                    if (match) {
                        currentSegment.lines.push({
                            speaker: match[1].trim(),
                            text: match[2].trim()
                        });
                    } else {
                        // Handle lines without speaker prefix

                        // Ignore sound instructions in parens
                        if (line.startsWith('(') && line.endsWith(')')) {
                            continue;
                        }

                        // Try to find default speaker from metadata
                        let singleSpeaker: string | null = null;
                        if (currentSegment.speakerCount) {
                            const match = currentSegment.speakerCount.match(/1\s*\((.*?)\)/);
                            if (match) {
                                singleSpeaker = match[1].trim();
                            }
                        }

                        if (singleSpeaker) {
                            currentSegment.lines.push({
                                speaker: singleSpeaker,
                                text: line
                            });
                        } else {
                            // If multiple speakers, append to previous line if exists
                            if (currentSegment.lines.length > 0) {
                                const lastLine = currentSegment.lines[currentSegment.lines.length - 1];
                                lastLine.text += ' ' + line;
                            } else {
                                // Fallback if no previous line and multiple speakers (shouldn't happen in valid script)
                                // Treat as \"Narrator\" or \"Unknown\"
                                currentSegment.lines.push({
                                    speaker: 'Narrator',
                                    text: line
                                });
                            }
                        }
                    }
                }
            }
        }

        // Push the last segment
        if (currentSegment) {
            segments.push(currentSegment);
        }

        return segments;
    }
}

export interface ScriptLine {
    speaker: string;
    text: string;
}

export interface ScriptSegment {
    id: string;
    section: string;
    name: string;
    duration?: string;
    speakerCount?: string;
    lines: ScriptLine[];
}

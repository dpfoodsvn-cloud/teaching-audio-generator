import { useState, useRef, useEffect } from 'react';
import { TTSWorker } from './core/ttsWorker';
import { ScriptPreprocessor } from './core/ScriptPreprocessor';
import type { SpeakerInfo } from './core/ScriptPreprocessor';
import { AudioStitcher } from './core/stitcher';
import JSZip from 'jszip';
import './App.css';

// Inline type definitions
interface ScriptLine {
    speaker: string;
    text: string;
}

interface ScriptSegment {
    id: string;
    section: string;
    name: string;
    duration?: string;
    speakerCount?: string;
    speakerGenders?: Record<string, 'male' | 'female' | 'unknown'>;
    parseError?: string;
    lines: ScriptLine[];
    status?: 'pending' | 'processing' | 'completed' | 'error';
    error?: string;
    audioData?: Blob;
    filename?: string;
}

// Text sanitizer to fix encoding issues (smart quotes, em-dashes, etc)
const sanitizeText = (text: string): string => {
    return text
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/\u00A0/g, ' ');
};

// Parse speaker genders from SPEAKERS header
// Supports: "2 (Teacher, Male; Student, Female)" or "1 (Narrator, Male)"
const parseSpeakerGenders = (speakerLine: string): { genders: Record<string, 'male' | 'female' | 'unknown'>; error?: string } => {
    const genders: Record<string, 'male' | 'female' | 'unknown'> = {};
    const m = speakerLine.match(/\(([^)]+)\)/);
    if (!m) {
        console.log('[Gender Parser] No parentheses found in:', speakerLine);
        return { genders, error: 'No speaker details in parentheses' };
    }
    const parts = m[1].split(';');
    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const idx = trimmed.indexOf(',');
        if (idx === -1) {
            const name = trimmed.trim();
            if (name) { genders[name] = 'unknown'; }
            continue;
        }
        const name = trimmed.substring(0, idx).trim();
        const desc = trimmed.substring(idx + 1).toLowerCase().trim();
        if (!name) continue;
        if (desc.includes('female') || desc.includes('woman') || desc.includes('girl')) {
            genders[name] = 'female';
        } else if (desc.includes('male') || desc.includes('man') || desc.includes('boy')) {
            genders[name] = 'male';
        } else {
            genders[name] = 'unknown';
        }
        console.log('[Gender Parser] ' + name + ' -> ' + genders[name]);
    }
    if (Object.keys(genders).length === 0) { return { genders, error: 'Could not parse speakers' }; }
    console.log('[Gender Parser] Extracted:', genders);
    return { genders };
};

// Inline Script Parser
class ScriptParser {
    static parse(content: string): ScriptSegment[] {
        console.log('Parser starting...');
        const segments: ScriptSegment[] = [];
        const sanitizedContent = sanitizeText(content);
        const lines = sanitizedContent.split(/\r?\n/);
        let currentSegment: ScriptSegment | null = null;
        let captureDialogue = false;
        let headersParsed = false;

        const isSeparator = (line: string) => {
            const separatorPattern = /^[\s\-\u2010-\u2015\u2500-\u257F_=]+$/;
            const hasSeparatorChar = /[\-\u2010-\u2015\u2500-\u257F_=]/;
            return separatorPattern.test(line) && hasSeparatorChar.test(line);
        };

        // Filter out sound effect/stage direction lines
        const isSoundEffectOnly = (text: string): boolean => {
            const trimmed = text.trim();
            // Check for lines purely enclosed in parentheses or brackets
            if (/^\([^)]+\)$/.test(trimmed) || /^\[[^\]]+\]$/.test(trimmed) || /^_.*_$/.test(trimmed)) {
                console.log('[Parser] Skipping sound effect/stage direction:', trimmed);
                return true;
            }
            // Check for specific keywords if not fully enclosed but looks like direction
            const lowerText = trimmed.toLowerCase();
            if ((lowerText.startsWith('(') || lowerText.startsWith('[')) && 
                (lowerText.includes('sound') || lowerText.includes('music') || lowerText.includes('sfx') || lowerText.includes('transition'))) {
                console.log('[Parser] Skipping sound effect:', trimmed);
                return true;
            }
            return false;
        };

                // Check if content has SCRIPT ID format
        const hasScriptId = content.includes('SCRIPT ID:');

        if (!hasScriptId) {
            // Enhanced fallback: Split on ## Audio headers for multiple segments
            console.log('Using enhanced markdown parser...');
            let currentSegment: ScriptSegment | null = null;
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                
                if (isSoundEffectOnly(trimmed)) continue;

                // Check for markdown audio header (## Audio A1: Title)
                const headerMatch = trimmed.match(/^(?:##\s*|\*\*\s*)Audio\s+([A-Za-z0-9]+):\s*(.*)$/i);
                if (headerMatch) {
                    // Save previous segment
                    if (currentSegment && currentSegment.lines.length > 0) {
                        segments.push(currentSegment);
                    }
                    // Start new segment
                    currentSegment = {
                        id: headerMatch[1],
                        section: 'Audio',
                        name: headerMatch[2] || headerMatch[1],
                        lines: [],
                        status: 'pending'
                    };
                    continue;
                }
                
                // Skip other markdown headers and formatting
                if (trimmed.startsWith('####') || trimmed.match(/^\*\*?Answers?:/i) || trimmed.match(/^\*Script:/i)) continue;
                
                // If no segment yet, create default one
                if (!currentSegment) {
                    currentSegment = {
                        id: 'segment-1',
                        section: 'Script',
                        name: 'Pasted Script',
                        lines: [],
                        status: 'pending'
                    };
                }
                
                // Match dialogue pattern: Speaker: Text (short speaker names like A, B, Interviewer)
                const dialogueMatch = trimmed.match(/^([A-Za-z][A-Za-z]*(?:\s+[A-Za-z]+)?):\s*(.+)$/);
                if (dialogueMatch) {
                    currentSegment.lines.push({
                        speaker: dialogueMatch[1].trim(),
                        text: dialogueMatch[2].trim()
                    });
                } else {
                    // Narration - add as Narrator
                    currentSegment.lines.push({
                        speaker: 'Narrator',
                        text: trimmed.replace(/\*\*/g, '') // Remove markdown bold
                    });
                }
            }
            
            // Push final segment
            if (currentSegment && currentSegment.lines.length > 0) {
                segments.push(currentSegment);
            }
            
            console.log('Parsed', segments.length, 'segments');
            return segments;
        }

        // Original SCRIPT ID format parsing
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            if (line.startsWith('SCRIPT ID:')) {
                if (currentSegment) segments.push(currentSegment);
                currentSegment = {
                    id: line.replace('SCRIPT ID:', '').trim(),
                    section: '',
                    name: '',
                    lines: [],
                    status: 'pending'
                };
                captureDialogue = false;
                headersParsed = false;
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
                    const speakersValue = line.replace('SPEAKERS:', '').trim();
                    currentSegment.speakerCount = speakersValue;
                    
                    // Parse gender information from SPEAKERS header
                    const { genders, error } = parseSpeakerGenders(speakersValue);
                    if (Object.keys(genders).length > 0) {
                        currentSegment.speakerGenders = genders;
                        console.log('[Parser] Segment ' + currentSegment.id + ': Parsed genders:', genders);
                    }
                    if (error) {
                        currentSegment.parseError = error;
                        console.warn('[Parser] Segment ' + currentSegment.id + ': ' + error);
                    }
                    headersParsed = true;
                } else if (isSeparator(line)) {
                    captureDialogue = true;
                } else {
                    if (!captureDialogue && headersParsed && !line.includes(':')) {
                        captureDialogue = true;
                    }

                    if (captureDialogue) {
                        if (isSeparator(line) || isSoundEffectOnly(line)) continue;

                        const match = line.match(/^([^:]+):\s*(.+)$/);
                        if (match) {
                            currentSegment.lines.push({
                                speaker: match[1].trim(),
                                text: match[2].trim()
                            });
                        } else {
                            let singleSpeaker: string | null = null;
                            if (currentSegment.speakerCount) {
                                const speakerMatch = currentSegment.speakerCount.match(/1\s*\(([^)]+)\)/);
                                if (speakerMatch) {
                                    singleSpeaker = speakerMatch[1].trim();
                                }
                            }

                            const speaker = singleSpeaker || 'Narrator';

                            if (line && !isSeparator(line) && !isSoundEffectOnly(line)) {
                                if (currentSegment.lines.length > 0 && !singleSpeaker) {
                                    currentSegment.lines[currentSegment.lines.length - 1].text += ' ' + line;
                                } else {
                                    currentSegment.lines.push({ speaker, text: line });
                                }
                            }
                        }
                    }
                }
            }
        }
        if (currentSegment) segments.push(currentSegment);
        console.log('Parsed', segments.length, 'segments');
        return segments;
    }
}

const stripRtf = (rtf: string): string => {
    let text = rtf;
    text = text.replace(/\\[a-z]+(-?[0-9]+)? ?/g, ' ');
    text = text.replace(/[{}]/g, '');
    text = text.replace(/\\'([0-9a-fA-F]{2})/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
    });
    text = text.replace(/\s+/g, ' ').trim();
    return text;
};

const saveFile = async (blob: Blob, filename: string) => {
    console.log(`[SaveFile] Starting download for ${filename} (${blob.size} bytes, type: ${blob.type})`);

    try {
        // @ts-ignore
        if (window.showSaveFilePicker) {
            // @ts-ignore
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: 'WAV Audio File',
                    accept: { 'audio/wav': ['.wav'] },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            console.log('[SaveFile] Saved via File System Access API');
            return;
        }
    } catch (err) {
        console.warn('[SaveFile] File System Access API failed or cancelled, falling back to download:', err);
    }

    const downloadBlob = new Blob([blob], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(downloadBlob);

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    console.log('[SaveFile] Triggered download');
};

function App() {
    // Mode state
    const [mode, setMode] = useState<'batch' | 'single'>('batch');

    // Essential state
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
    const [temperature, setTemperature] = useState(1.0);
    const [speed, setSpeed] = useState(1.0);
    const [retryDelay, setRetryDelay] = useState(5000);

    // Batch mode state
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const [segments, setSegments] = useState<ScriptSegment[]>([]);
    const [speakers, setSpeakers] = useState<string[]>([]);
    const [voiceMapping, setVoiceMapping] = useState<Record<string, string>>({});
    const [isDragging, setIsDragging] = useState(false);

    const [batchInputMode, setBatchInputMode] = useState<'file' | 'paste'>('file');
    const [batchScriptText, setBatchScriptText] = useState('');
    const [cleanedScriptText, setCleanedScriptText] = useState('');
    // Single mode state
    const [singleScriptText, setSingleScriptText] = useState('');
    const [singleStatus, setSingleStatus] = useState('Paste a single script segment to generate');
    const [singleSpeakers, setSingleSpeakers] = useState<string[]>([]);
    const [singleVoiceMapping, setSingleVoiceMapping] = useState<Record<string, string>>({});
    const [singleAudioData, setSingleAudioData] = useState<Blob | null>(null);
    const [singleFilename, setSingleFilename] = useState<string>('');

    // Processing state
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);
    const [status, setStatus] = useState('Ready to upload script template');
    // AI Preprocessing state
    const [aiPreprocessEnabled, setAiPreprocessEnabled] = useState(true);
    const [isPreprocessing, setIsPreprocessing] = useState(false);
    const [preprocessStatus, setPreprocessStatus] = useState('');
    const [detectedSpeakers, setDetectedSpeakers] = useState<SpeakerInfo[]>([]);


    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Official Gemini TTS voice list (30 supported voices)
    const voices = [
        'Aoede', 'Kore', 'Leda', 'Zephyr', 'Puck',
        'Charon', 'Fenrir', 'Orus', 'Achird',
        'Achernar', 'Algenib', 'Algieba', 'Alnilam', 'Autonoe',
        'Callirrhoe', 'Despina', 'Enceladus', 'Erinome', 'Gacrux',
        'Iapetus', 'Laomedeia', 'Pulcherrima', 'Rasalgethi',
        'Sadachbia', 'Sadaltager', 'Schedar', 'Sulafat',
        'Umbriel', 'Vindemiatrix', 'Zubenelgenubi'
    ];
    const MALE_VOICES = ['Charon', 'Fenrir', 'Orus', 'Achird', 'Achernar', 'Alnilam', 'Puck', 'Umbriel', 'Zubenelgenubi', 'Iapetus', 'Gacrux', 'Enceladus', 'Rasalgethi', 'Sadachbia'];
    const FEMALE_VOICES = ['Aoede', 'Kore', 'Leda', 'Zephyr', 'Algenib', 'Algieba', 'Callirrhoe', 'Sulafat', 'Vindemiatrix', 'Laomedeia', 'Pulcherrima', 'Despina', 'Erinome', 'Autonoe'];

    const detectGender = (name: string): 'male' | 'female' | 'unknown' => {
        const lowerName = name.toLowerCase();
        const femalePatterns = [
            /\b(mrs|ms|miss|lady|woman|girl|mother|mom|mum|aunt|grandma|sister|daughter|queen|princess|sophie|sarah|mary|jane|lisa|emma|olivia|ava|isabella|mia|charlotte|amelia|harper|evelyn|anna|chloe|mai|lan|hong|linh|kim|jessica|jennifer|emily|nicole|female|nutritionist|grandmother|grandma|child)\b/,
            /^(she|her)$/
        ];
        const malePatterns = [
            /\b(mr|sir|man|boy|father|dad|pop|uncle|grandpa|brother|son|king|prince|leo|liam|mark|john|james|robert|michael|william|david|richard|joseph|thomas|charles|ben|tom|peter|paul|george|henry|frank|sam|jack|alex|chris|mike|joe|dan|steve|nick|tim|tony|andrew|kevin|brian|ethan|noah|oliver|jacob|lucas|mason|logan|ryan|nathan|kyle|narrator|interviewer|male|teacher|student|host|speaker)\b/,
            /^(he|him)$/
        ];
        if (femalePatterns.some(p => p.test(lowerName))) return 'female';
        if (malePatterns.some(p => p.test(lowerName))) return 'male';
        return 'unknown';
    };

    const handleApiKeyChange = (value: string) => {
        setApiKey(value);
        localStorage.setItem('gemini_api_key', value);
    };

    // Handle voice mapping changes
    const handleVoiceChange = (speaker: string, voice: string) => {
        setVoiceMapping(prev => ({
            ...prev,
            [speaker]: voice
        }));
    };

    // Handle single mode voice mapping changes  
    const handleSingleVoiceChange = (speaker: string, voice: string) => {
        setSingleVoiceMapping(prev => ({
            ...prev,
            [speaker]: voice
        }));
    };

    // Auto-detect speakers when pasting in Single Mode
    useEffect(() => {
        if (mode === 'single' && singleScriptText.trim()) {
            const parsed = ScriptParser.parse(singleScriptText);
            if (parsed.length > 0) {
                const segment = parsed[0];
                const uniqueSpeakers = new Set<string>();
                segment.lines.forEach(line => uniqueSpeakers.add(line.speaker));
                const speakerList = Array.from(uniqueSpeakers);

                if (JSON.stringify(speakerList) !== JSON.stringify(singleSpeakers)) {
                    setSingleSpeakers(speakerList);

                    // Auto-assign voices
                    const newMapping: Record<string, string> = { ...singleVoiceMapping };
                    const usedVoices = new Set<string>(Object.values(newMapping));
                    let maleCounter = 0;
                    let femaleCounter = 0;
                    let neutralCounter = 0;

                    speakerList.forEach(speaker => {
                        if (!newMapping[speaker]) {
                            const gender = detectGender(speaker);
                            let candidates: string[] = [];

                            if (gender === 'female') candidates = FEMALE_VOICES;
                            else if (gender === 'male') candidates = MALE_VOICES;
                            else candidates = voices;

                            let assignedVoice = candidates.find(v => !usedVoices.has(v));

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
                            newMapping[speaker] = assignedVoice;
                            usedVoices.add(assignedVoice);
                        }
                    });
                    setSingleVoiceMapping(newMapping);
                }
            }
        }
    }, [singleScriptText, mode]);

    const handleFileSelect = async (selectedFile: File) => {
        setFile(selectedFile);
        const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
        setFileName(nameWithoutExt);

        let text = '';
        if (selectedFile.name.toLowerCase().endsWith('.rtf')) {
            const rtfContent = await selectedFile.text();
            text = stripRtf(rtfContent);
        } else {
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
        setSpeakers(speakerList);

        const initialMapping: Record<string, string> = {};
        const usedVoices = new Set<string>();
        let maleCounter = 0;
        let femaleCounter = 0;
        let neutralCounter = 0;

        // Collect parsed genders from all segments
        const parsedGenders: Record<string, 'male' | 'female' | 'unknown'> = {};
        parsedSegments.forEach(seg => {
            if (seg.speakerGenders) {
                Object.assign(parsedGenders, seg.speakerGenders);
            }
        });
        console.log('[Voice Assignment] Collected parsed genders:', parsedGenders);

        speakerList.forEach((speaker) => {
            // Use parsed gender from segment if available, otherwise detect from name
            const gender = parsedGenders[speaker] || detectGender(speaker);
            console.log('[Voice Assignment] Speaker:', speaker, '-> Gender:', gender, parsedGenders[speaker] ? '(parsed)' : '(detected)');
            let candidates: string[] = [];

            if (gender === 'female') candidates = FEMALE_VOICES;
            else if (gender === 'male') candidates = MALE_VOICES;
            else candidates = voices;

            let assignedVoice = candidates.find(v => !usedVoices.has(v));

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

            usedVoices.add(assignedVoice);
            initialMapping[speaker] = assignedVoice;
        });

        setVoiceMapping(initialMapping);
        setStatus(`Loaded ${parsedSegments.length} segments with ${speakerList.length} speakers`);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    // Handle pasting script text in batch mode
    const handleBatchPaste = async () => {
        if (!batchScriptText.trim()) return;
        
        const parsedSegments = ScriptParser.parse(batchScriptText);
        
        // Generate cleaned text preview from parsed segments (no API needed)
        const cleanedLines: string[] = [];
        parsedSegments.forEach(seg => {
            cleanedLines.push('## ' + seg.id + ': ' + seg.name);
            seg.lines.forEach(line => {
                cleanedLines.push(line.speaker + ': ' + line.text);
            });
            cleanedLines.push('');
        });
        setCleanedScriptText(cleanedLines.join('\n'));
        setSegments(parsedSegments);
        setTotal(parsedSegments.length);
        setFileName('Pasted_Script');

        const uniqueSpeakers = new Set<string>();
        parsedSegments.forEach(seg => {
            seg.lines.forEach(line => uniqueSpeakers.add(line.speaker));
        });
        const speakerList = Array.from(uniqueSpeakers);
        setSpeakers(speakerList);

        const initialMapping: Record<string, string> = {};
        const usedVoices = new Set<string>();
        let maleCounter = 0;
        let femaleCounter = 0;
        let neutralCounter = 0;

        // Collect parsed genders from all segments
        const parsedGenders: Record<string, 'male' | 'female' | 'unknown'> = {};
        parsedSegments.forEach(seg => {
            if (seg.speakerGenders) {
                Object.assign(parsedGenders, seg.speakerGenders);
            }
        });
        console.log('[Voice Assignment - Batch Paste] Collected parsed genders:', parsedGenders);

        speakerList.forEach((speaker) => {
            // Use parsed gender from segment if available, otherwise detect from name
            const gender = parsedGenders[speaker] || detectGender(speaker);
            console.log('[Voice Assignment - Batch Paste] Speaker:', speaker, '->', gender, parsedGenders[speaker] ? '(parsed)' : '(detected)');
            let candidates: string[] = [];

            if (gender === 'female') candidates = FEMALE_VOICES;
            else if (gender === 'male') candidates = MALE_VOICES;
            else candidates = voices;

            let assignedVoice = candidates.find(v => !usedVoices.has(v));

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

            usedVoices.add(assignedVoice);
            initialMapping[speaker] = assignedVoice;
        });

        setVoiceMapping(initialMapping);
        setStatus(`Loaded ${parsedSegments.length} segments with ${speakerList.length} speakers from pasted text`);
    };

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsProcessing(false);
            setStatus('Cancelled by user');
            setSingleStatus('Cancelled by user');
        }
    };

    // Single mode generation
    const handleSingleGenerate = async () => {
        if (!apiKey.trim()) {
            alert('Please enter at least one API key');
            return;
        }

        if (!singleScriptText.trim()) {
            alert('Please paste a script segment first');
            return;
        }

        const apiKeysList = apiKey.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);

        if (apiKeysList.length === 0) {
            alert('Please enter a valid API key');
            return;
        }

        setIsProcessing(true);
        setSingleStatus('Parsing script...');

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const parsedSegments = ScriptParser.parse(singleScriptText);

            if (parsedSegments.length === 0) {
                alert('Could not parse the script. Please check the format.');
                setIsProcessing(false);
                setSingleStatus('Error: Could not parse script');
                return;
            }

            if (parsedSegments.length > 1) {
                alert(`Found ${parsedSegments.length} segments. Please paste only ONE segment at a time.`);
                setIsProcessing(false);
                setSingleStatus('Error: Multiple segments detected');
                return;
            }

            const segment = parsedSegments[0];
            setSingleStatus(`Generating audio for ${segment.id}...`);

            // Generate audio
            const lineBlobs: Blob[] = [];

            for (const line of segment.lines) {
                const speakerVoice = singleVoiceMapping[line.speaker] || voices[0];

                const results = await TTSWorker.generateBatch(
                    [line.text],
                    {
                        apiKey: apiKeysList[0],
                        apiKeys: apiKeysList,
                        modelName: 'gemini-2.5-flash-preview-tts',
                        voiceName: speakerVoice,
                        stylePrompt: '',
                        temperature,
                        speed,
                        pitch: 0,
                    },
                    1,
                    retryDelay,
                    undefined,
                    undefined,
                    controller.signal
                );

                lineBlobs.push(results[0].audioBlob);
            }

            const segmentAudio = await AudioStitcher.stitchAudio(lineBlobs);
            const extension = 'wav';

            // Create filename
            const isCustomId = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment.id);
            let filename: string;

            if (isCustomId) {
                const safeId = segment.id.replace(/[^a-zA-Z0-9-_]/g, '_');
                filename = `${safeId}.${extension}`;
            } else {
                filename = `Single_${Date.now()}.${extension}`;
            }

            // Store for manual download
            setSingleAudioData(segmentAudio);
            setSingleFilename(filename);
            setSingleStatus('Generation complete! Ready to download.');

        } catch (error) {
            console.error('Single generation error:', error);
            setSingleStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSingleDownload = async () => {
        if (singleAudioData && singleFilename) {
            await saveFile(singleAudioData, singleFilename);
            setSingleStatus(`Downloaded: ${singleFilename}`);
        }
    };

    // Batch mode generation
    const handleGenerate = async () => {
        if (!apiKey.trim()) {
            alert('Please enter at least one API key');
            return;
        }

        if (segments.length === 0) {
            alert('Please upload a script template first');
            return;
        }

        const apiKeysList = apiKey.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);

        if (apiKeysList.length === 0) {
            alert('Please enter a valid API key');
            return;
        }

        const segmentsToProcess = segments.filter(s => s.status !== 'completed');

        if (segmentsToProcess.length === 0) {
            alert('All segments are already completed!');
            return;
        }

        setIsProcessing(true);
        const completedCount = segments.filter(s => s.status === 'completed').length;
        setProgress(completedCount);

        setStatus(segmentsToProcess.length < segments.length
            ? `Retrying ${segmentsToProcess.length} failed/pending segments...`
            : 'Starting audio generation...');

        const controller = new AbortController();
        abortControllerRef.current = controller;

        let currentProcessedCount = 0;

        try {
            setSegments(prev => prev.map(s =>
                segmentsToProcess.find(p => p.id === s.id)
                    ? { ...s, status: 'processing', error: undefined }
                    : s
            ));

            for (const segment of segmentsToProcess) {
                if (controller.signal.aborted) break;

                setStatus(`Processing segment ${segment.id}...`);

                try {
                    const lineBlobs: Blob[] = [];

                    for (const line of segment.lines) {
                        const speakerVoice = voiceMapping[line.speaker] || voices[0];

                        const results = await TTSWorker.generateBatch(
                            [line.text],
                            {
                                apiKey: apiKeysList[0],
                                apiKeys: apiKeysList,
                                modelName: 'gemini-2.5-flash-preview-tts',
                                voiceName: speakerVoice,
                                stylePrompt: '',
                                temperature,
                                speed,
                                pitch: 0,
                            },
                            1,
                            retryDelay,
                            undefined,
                            undefined,
                            controller.signal
                        );

                        lineBlobs.push(results[0].audioBlob);
                    }

                    const segmentAudio = await AudioStitcher.stitchAudio(lineBlobs);
                    const extension = 'wav';

                    const isCustomId = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment.id);

                    let filename: string;
                    const originalIndex = segments.findIndex(s => s.id === segment.id);

                    if (isCustomId) {
                        const safeId = segment.id.replace(/[^a-zA-Z0-9-_]/g, '_');
                        filename = `${safeId}.${extension}`;
                    } else {
                        const firstLine = segment.lines[0];
                        const safeSpeaker = firstLine ? firstLine.speaker.replace(/[^a-zA-Z0-9]/g, '_') : 'Unknown';
                        const safeText = firstLine ? firstLine.text.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_') : 'audio';
                        filename = `${String(originalIndex + 1).padStart(3, '0')}_${safeSpeaker}_${safeText}.${extension}`;
                    }

                    setSegments(prev => prev.map(s =>
                        s.id === segment.id
                            ? { ...s, status: 'completed', audioData: segmentAudio, filename }
                            : s
                    ));

                    // Manual download only for batch mode (auto-download removed)

                    currentProcessedCount++;
                    setProgress(prev => prev + 1);

                } catch (err) {
                    console.error(`Error processing segment ${segment.id}:`, err);
                    setSegments(prev => prev.map(s =>
                        s.id === segment.id
                            ? { ...s, status: 'error', error: err instanceof Error ? err.message : String(err) }
                            : s
                    ));
                }
            }

            setStatus(`Cycle complete. Processed ${currentProcessedCount} segments.`);

        } catch (error) {
            console.error('Generation loop error:', error);
            setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownloadZip = async () => {
        const completedSegments = segments.filter(s => s.status === 'completed' && s.audioData && s.filename);
        if (completedSegments.length === 0) {
            alert('No completed segments to download.');
            return;
        }

        setStatus('Creating ZIP file...');
        const zip = new JSZip();

        completedSegments.forEach(seg => {
            if (seg.audioData && seg.filename) {
                zip.file(seg.filename, seg.audioData);
            }
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        await saveFile(zipBlob, `${fileName || 'Teaching_Audio'}.zip`);
        setStatus(`Downloaded ${completedSegments.length} files.`);
    };

    return (
        <div className="app">
            <header className="app-header">
                <div className="container">
                    <h1 className="app-title">Teaching Audio Generator <span style={{ fontSize: '0.6em', opacity: 0.7 }}>v4.0</span></h1>
                    <p className="app-subtitle">Multi-Speaker Script to Audio</p>
                </div>
            </header>

            <main className="container">
                <div className="card">
                    {/* Mode Toggle */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #333', paddingBottom: '10px' }}>
                        <button
                            onClick={() => setMode('batch')}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '4px',
                                border: 'none',
                                background: mode === 'batch' ? '#4caf50' : '#333',
                                color: '#fff',
                                cursor: 'pointer',
                                fontWeight: mode === 'batch' ? 'bold' : 'normal'
                            }}
                        >
                            Batch Mode
                        </button>
                        <button
                            onClick={() => setMode('single')}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '4px',
                                border: 'none',
                                background: mode === 'single' ? '#4caf50' : '#333',
                                color: '#fff',
                                cursor: 'pointer',
                                fontWeight: mode === 'single' ? 'bold' : 'normal'
                            }}
                        >
                            Single Mode
                        </button>
                    </div>

                    {/* API Key & Controls */}
                    <div className="controls-section">
                        <div className="control-group" style={{ flex: 2 }}>
                            <label htmlFor="api-key">API Keys * (One per line for rotation)</label>
                            <textarea
                                id="api-key"
                                value={apiKey}
                                onChange={(e) => handleApiKeyChange(e.target.value)}
                                placeholder="Enter your Gemini API keys (one per line)"
                                rows={3}
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    borderRadius: '4px',
                                    border: '1px solid #444',
                                    background: '#222',
                                    color: '#fff',
                                    fontFamily: 'monospace',
                                    resize: 'vertical'
                                }}
                            />
                        </div>
                        <div className="control-group" style={{ flex: 1 }}>
                            <label htmlFor="temperature">Temperature: {temperature.toFixed(1)}</label>
                            <input
                                id="temperature"
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                value={temperature}
                                onChange={(e) => setTemperature(Number(e.target.value))}
                            />
                        </div>
                        <div className="control-group" style={{ flex: 1 }}>
                            <label htmlFor="speed">Speed: {speed.toFixed(1)}x</label>
                            <input
                                id="speed"
                                type="range"
                                min="0.5"
                                max="2.0"
                                step="0.1"
                                value={speed}
                                onChange={(e) => setSpeed(Number(e.target.value))}
                            />
                        </div>
                        <div className="control-group" style={{ flex: 1 }}>
                            <label htmlFor="retry-delay">Retry Delay: {retryDelay}ms</label>
                            <input
                                id="retry-delay"
                                type="range"
                                min="1000"
                                max="10000"
                                step="500"
                                value={retryDelay}
                                onChange={(e) => setRetryDelay(Number(e.target.value))}
                            />
                        </div>
                    </div>

                    {/* AI Preprocess Toggle */}
                    <div style={{ marginBottom: '15px', padding: '10px', background: '#252525', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={aiPreprocessEnabled}
                                onChange={(e) => setAiPreprocessEnabled(e.target.checked)}
                                style={{ width: '18px', height: '18px' }}
                            />
                            <span>AI Preprocess</span>
                        </label>
                        {isPreprocessing && <span style={{ color: '#4caf50', fontSize: '0.9em' }}>Processing...</span>}
                        {preprocessStatus && <span style={{ fontSize: '0.85em', color: '#888' }}>{preprocessStatus}</span>}
                    </div>

                    {/* Speaker Preview */}
                    {detectedSpeakers.length > 0 && (
                        <div style={{ marginBottom: '15px', padding: '12px', background: '#252525', borderRadius: '6px', border: '1px solid #333' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95em', color: '#aaa' }}>
                                Detected Speakers ({detectedSpeakers.length})
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                                {detectedSpeakers.map((speaker, idx) => (
                                    <div key={idx} style={{ padding: '8px 12px', background: '#333', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>
                                            <strong>{speaker.name}</strong>
                                            <span style={{ marginLeft: '8px', fontSize: '0.85em', color: speaker.detectedGender === 'female' ? '#f48fb1' : speaker.detectedGender === 'male' ? '#64b5f6' : '#888' }}>
                                                {speaker.detectedGender === 'female' ? 'F' : speaker.detectedGender === 'male' ? 'M' : '?'}
                                            </span>
                                        </span>
                                        <span style={{ fontSize: '0.85em', color: '#888' }}>{speaker.lineCount} lines</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Content Area - Switch based on mode */}
                    {mode === 'single' ? (
                        /* Single Mode UI */
                        <div style={{ marginTop: '20px' }}>
                            <div className="form-group">
                                <label htmlFor="single-script">Paste Single Script Segment</label>
                                <textarea
                                    id="single-script"
                                    value={singleScriptText}
                                    onChange={(e) => setSingleScriptText(e.target.value)}
                                    placeholder={`SCRIPT ID: 01\nSECTION: Introduction\nNAME: Welcome\nDURATION: 30s\nSPEAKERS: 2 (Teacher, Student)\n---\nTeacher: Hello everyone!\nStudent: Hi!`}
                                    rows={15}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        borderRadius: '4px',
                                        border: '1px solid #444',
                                        background: '#222',
                                        color: '#fff',
                                        fontFamily: 'monospace',
                                        fontSize: '14px',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>

                            {/* Speaker Preview for Single Mode */}
                            {singleSpeakers.length > 0 && (
                                <div style={{ marginTop: '15px', padding: '10px', background: '#2a2a2a', borderRadius: '4px' }}>
                                    <h4 style={{ marginTop: 0, marginBottom: '10px' }}>Detected Speakers & Voices</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                                        {singleSpeakers.map(speaker => (
                                            <div key={speaker} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <label style={{ fontSize: '0.9em', color: '#aaa' }}>{speaker}</label>
                                                <select
                                                    value={singleVoiceMapping[speaker] || ''}
                                                    onChange={(e) => setSingleVoiceMapping(prev => ({ ...prev, [speaker]: e.target.value }))}
                                                    style={{ padding: '5px', borderRadius: '4px', background: '#333', color: '#fff', border: '1px solid #555' }}
                                                >
                                                    {voices.map(v => (
                                                        <option key={v} value={v}>{v}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="action-buttons" style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                                <button
                                    className="btn-primary"
                                    onClick={handleSingleGenerate}
                                    disabled={isProcessing || !singleScriptText.trim()}
                                >
                                    {isProcessing ? 'Processing...' : 'Generate Single Audio'}
                                </button>

                                {singleAudioData && !isProcessing && (
                                    <button
                                        className="btn-secondary"
                                        onClick={handleSingleDownload}
                                        style={{ background: '#4caf50', color: 'white', border: 'none' }}
                                    >
                                        Download Audio
                                    </button>
                                )}

                                {isProcessing && (
                                    <button className="btn-secondary" onClick={handleCancel}>
                                        Cancel
                                    </button>
                                )}
                            </div>

                            <div style={{ marginTop: '15px', padding: '10px', background: '#1a1a1a', borderRadius: '4px', fontSize: '14px' }}>
                                <strong>Status:</strong> {singleStatus}
                            </div>
                        </div>
                    ) : (
                        /* Batch Mode UI */
                        <>
                            {/* Input Mode Toggle */}
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                <button
                                    onClick={() => { setBatchInputMode('file'); setSegments([]); setSpeakers([]); }}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '4px',
                                        border: 'none',
                                        background: batchInputMode === 'file' ? '#4caf50' : '#333',
                                        color: '#fff',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Upload File
                                </button>
                                <button
                                    onClick={() => { setBatchInputMode('paste'); setFile(null); setSegments([]); setSpeakers([]); }}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '4px',
                                        border: 'none',
                                        background: batchInputMode === 'paste' ? '#4caf50' : '#333',
                                        color: '#fff',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Paste Text
                                </button>
                            </div>

                            {batchInputMode === 'paste' ? (
                                /* Paste Mode */
                                <div>
                                    <textarea
                                        value={batchScriptText}
                                        onChange={(e) => setBatchScriptText(e.target.value)}
                                        placeholder="Paste your scripts here (multiple segments supported)..."
                                        rows={12}
                                        style={{
                                            width: '100%',
                                            padding: '12px',
                                            borderRadius: '4px',
                                            border: '1px solid #444',
                                            background: '#222',
                                            color: '#fff',
                                            fontFamily: 'monospace',
                                            fontSize: '13px',
                                            resize: 'vertical',
                                            marginBottom: '10px'
                                        }}
                                    />
                                    <button
                                        className="btn-primary"
                                        onClick={handleBatchPaste}
                                        disabled={!batchScriptText.trim()}
                                        style={{ marginBottom: '15px' }}
                                    >
                                        Parse Scripts
                                    </button>
                                    
                                    {/* AI Cleaned Text Preview */}
                                    {cleanedScriptText && (
                                        <div style={{ marginBottom: '15px', padding: '12px', background: '#1a2a1a', borderRadius: '6px', border: '1px solid #2a4a2a' }}>
                                            <h4 style={{ margin: '0 0 10px 0', color: '#4caf50', fontSize: '0.9em' }}>
                                                AI Cleaned Script Preview
                                            </h4>
                                            <textarea
                                                value={cleanedScriptText}
                                                readOnly
                                                rows={8}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px',
                                                    borderRadius: '4px',
                                                    border: '1px solid #333',
                                                    background: '#111',
                                                    color: '#aaa',
                                                    fontFamily: 'monospace',
                                                    fontSize: '12px',
                                                    resize: 'vertical'
                                                }}
                                            />
                                        </div>
                                    )}
                                    
                                    {/* Show voice mapping and generate after parsing */}
                                    {segments.length > 0 && (
                                        <div style={{ marginTop: '15px' }}>
                                            <div className="stats" style={{ marginBottom: '15px' }}>
                                                <div className="stat">
                                                    <span className="stat-label">Segments</span>
                                                    <span className="stat-value">{segments.length}</span>
                                                </div>
                                                <div className="stat">
                                                    <span className="stat-label">Speakers</span>
                                                    <span className="stat-value">{speakers.length}</span>
                                                </div>
                                            </div>
                                            
                                            {speakers.length > 0 && (
                                                <div className="voice-mapping-grid" style={{ marginBottom: '20px' }}>
                                                    {speakers.map(speaker => (
                                                        <div key={speaker} className="voice-mapping-item">
                                                            <label>{speaker}</label>
                                                            <select
                                                                value={voiceMapping[speaker] || ''}
                                                                onChange={(e) => handleVoiceChange(speaker, e.target.value)}
                                                            >
                                                                {voices.map(v => (
                                                                    <option key={v} value={v}>{v}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            
                                            <div className="action-buttons">
                                                <button
                                                    className="btn-primary"
                                                    onClick={handleGenerate}
                                                    disabled={isProcessing || segments.every(s => s.status === 'completed')}
                                                >
                                                    {isProcessing ? 'Generating...' : 'Generate All Audio'}
                                                </button>
                                                {isProcessing && (
                                                    <button className="btn-secondary" onClick={handleCancel}>
                                                        Cancel
                                                    </button>
                                                )}
                                                {!isProcessing && segments.some(s => s.status === 'completed') && (
                                                    <button 
                                                        className="btn-secondary" 
                                                        onClick={handleDownloadZip}
                                                        style={{ background: '#4caf50', color: 'white', border: 'none' }}
                                                    >
                                                        Download ZIP ({segments.filter(s => s.status === 'completed').length} files)
                                                    </button>
                                                )}
                                            </div>
                                            
                                            {/* Progress */}
                                            {segments.length > 0 && (
                                                <div style={{ marginTop: '15px', padding: '10px', background: '#1a1a1a', borderRadius: '4px' }}>
                                                    <strong>Status:</strong> {status} ({progress}/{total})
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : !file ? (
                                <div
                                    className={`drop-zone ${isDragging ? 'dragging' : ''}`}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                                        accept=".txt,.md,.rtf"
                                        hidden
                                    />
                                    <div className="drop-zone-content">
                                        <div className="upload-icon">[File]</div>
                                        <p>Drag & drop your script template here</p>
                                        <p className="file-hint">or click to select a .txt, .md, or .rtf file</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="mapping-section">
                                    <div className="file-info">
                                        <span>[File] {file.name}</span>
                                        <button className="btn-secondary" onClick={() => setFile(null)}>Change File</button>
                                    </div>

                                    <div className="stats">
                                        <div className="stat">
                                            <span className="stat-label">Segments</span>
                                            <span className="stat-value">{segments.length}</span>
                                        </div>
                                        <div className="stat">
                                            <span className="stat-label">Speakers</span>
                                            <span className="stat-value">{speakers.length}</span>
                                        </div>
                                        <div className="stat">
                                            <span className="stat-label">Completed</span>
                                            <span className="stat-value" style={{ color: '#4caf50' }}>{segments.filter(s => s.status === 'completed').length}</span>
                                        </div>
                                        <div className="stat">
                                            <span className="stat-label">Failed</span>
                                            <span className="stat-value" style={{ color: '#f44336' }}>{segments.filter(s => s.status === 'error').length}</span>
                                        </div>
                                    </div>

                                    {/* Voice Mapping UI for Batch Mode */}
                                    {speakers.length > 0 && (
                                        <div className="voice-mapping-grid" style={{ marginBottom: '20px' }}>
                                            {speakers.map(speaker => (
                                                <div key={speaker} className="voice-mapping-item">
                                                    <label>{speaker}</label>
                                                    <select
                                                        value={voiceMapping[speaker] || ''}
                                                        onChange={(e) => handleVoiceChange(speaker, e.target.value)}
                                                    >
                                                        {voices.map(v => (
                                                            <option key={v} value={v}>{v}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="action-buttons">
                                        <button
                                            className="btn-primary"
                                            onClick={handleGenerate}
                                            disabled={isProcessing || segments.every(s => s.status === 'completed')}
                                        >
                                            {isProcessing ? 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Processing...' :
                                                segments.some(s => s.status === 'error') ? 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ Retry Failed Segments' :
                                                    segments.some(s => s.status === 'completed') ? 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¶ Resume Generation' :
                                                        'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â½ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Generate Audio'}
                                        </button>

                                        {segments.some(s => s.status === 'completed') && (
                                            <button
                                                className="btn-secondary"
                                                onClick={handleDownloadZip}
                                                disabled={isProcessing}
                                            >
                                                ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ Download ZIP ({segments.filter(s => s.status === 'completed').length})
                                            </button>
                                        )}

                                        {isProcessing && (
                                            <button className="btn-secondary" onClick={handleCancel}>
                                                ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ Cancel
                                            </button>
                                        )}
                                    </div>

                                    {segments.some(s => s.status === 'error') && (
                                        <div className="error-list" style={{ marginTop: '20px', padding: '10px', background: '#331111', borderRadius: '4px' }}>
                                            <h4>Failed Segments</h4>
                                            <ul style={{ listStyle: 'none', padding: 0 }}>
                                                {segments.filter(s => s.status === 'error').map(s => (
                                                    <li key={s.id} style={{ color: '#ff8888', marginBottom: '5px' }}>
                                                        <strong>{s.id}:</strong> {s.error}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}

                            {total > 0 && (
                                <div className="progress-section">
                                    <div className="progress-info">
                                        <span>{status}</span>
                                        <span className="progress-count">{progress} / {total}</span>
                                    </div>
                                    <div className="progress-bar">
                                        <div
                                            className="progress-fill"
                                            style={{ width: `${(progress / total) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}

export default App;















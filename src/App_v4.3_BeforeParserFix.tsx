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
    const contentInParens = m[1];
    const hasSemicolon = contentInParens.includes(';');
    const hasGenderKeyword = /\b(male|female|man|woman|boy|girl)\b/i.test(contentInParens);
    
    if (!hasSemicolon && !hasGenderKeyword) {
        console.log('[Gender Parser] Detected name-only format, using name-based detection');
        const names = contentInParens.split(',').map(n => n.trim()).filter(n => n);
        const femaleNames = /\b(lucy|linda|laura|lauren|lily|grace|natalie|rachel|rebecca|hannah|susan|karen|nancy|betty|helen|sandra|donna|carol|ruth|sharon|michelle|melissa|deborah|stephanie|amy|angela|marie|martha|julia|alice|diana|nadia|elena|rose|clara|iris|hazel|fiona|ivy|audrey|stella|nina|gina|tina|eva|ada|ella|maya|lena|zoe|cora|nora|dora|vera|sara|tara|kara|mira|sophie|sarah|mary|jane|lisa|emma|olivia|ava|isabella|mia|charlotte|amelia|harper|evelyn|anna|chloe|mai|lan|hong|linh|kim|jessica|jennifer|emily|nicole|thao|hoa|nga|huong|mrs|ms|miss|lady|woman|girl|mother|mom|aunt|grandma|sister|daughter|queen|princess)\b/i;
        const maleNames = /\b(sam|bob|bill|jim|ted|max|luke|adam|carl|eric|evan|gary|greg|ivan|ian|joel|josh|karl|kent|kurt|lars|leon|luis|marc|matt|neil|noel|omar|otto|phil|rene|rick|ross|rory|roy|sean|seth|todd|troy|wade|alan|dean|doug|leo|liam|mark|john|james|robert|michael|william|david|richard|joseph|thomas|charles|ben|tom|peter|paul|george|henry|frank|jack|alex|chris|mike|joe|dan|steve|nick|tim|tony|andrew|kevin|brian|ethan|noah|oliver|jacob|lucas|mason|logan|ryan|nathan|kyle|mr|sir|man|boy|father|dad|uncle|grandpa|brother|son|king|prince|narrator|interviewer|teacher|student|host|speaker)\b/i;
        
        for (const name of names) {
            if (femaleNames.test(name)) {
                genders[name] = 'female';
                console.log('[Gender Parser] ' + name + ' -> female (from name)');
            } else if (maleNames.test(name)) {
                genders[name] = 'male';
                console.log('[Gender Parser] ' + name + ' -> male (from name)');
            } else {
                genders[name] = 'unknown';
                console.log('[Gender Parser] ' + name + ' -> unknown');
            }
        }
        return { genders };
    }
    
    const parts = contentInParens.split(';');
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
            // Enhanced fallback: handles plain-text "Audio N: Title" and "SECTION X: Name" headers
            console.log('Using enhanced plain-text/markdown parser...');
            let currentSegment: ScriptSegment | null = null;
            let currentSection = 'Audio'; // tracks SECTION A / B / C dividers
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                
                if (isSoundEffectOnly(trimmed)) continue;

                // Detect SECTION divider: "SECTION B: TRUE/FALSE" (skip as dialogue)
                const sectionDivider = trimmed.match(/^SECTION\s+([A-Z])(?::\s*(.+))?$/i);
                if (sectionDivider) {
                    currentSection = 'Section ' + sectionDivider[1].toUpperCase() +
                        (sectionDivider[2] ? ': ' + sectionDivider[2].trim() : '');
                    console.log('[Parser] Section:', currentSection);
                    continue;
                }

                // Audio header — with or without ## / ** prefix
                // Matches: "Audio 1: Title", "## Audio A1: Title", "**Audio 2: Title"
                const headerMatch = trimmed.match(/^(?:##\s*|\*\*\s*)?Audio\s+([A-Za-z0-9]+):\s*(.*)$/i);
                if (headerMatch) {
                    if (currentSegment && currentSegment.lines.length > 0) {
                        segments.push(currentSegment);
                    }
                    currentSegment = {
                        id: headerMatch[1],
                        section: currentSection,
                        name: headerMatch[2].trim() || headerMatch[1],
                        lines: [],
                        status: 'pending'
                    };
                    continue;
                }
                
                // Skip extra markdown headers and formatting noise
                if (trimmed.startsWith('####') || trimmed.match(/^\*\*?Answers?:/i) || trimmed.match(/^\*Script:/i)) continue;
                
                // If no segment started yet, create a default container
                if (!currentSegment) {
                    currentSegment = {
                        id: 'segment-1',
                        section: currentSection,
                        name: 'Pasted Script',
                        lines: [],
                        status: 'pending'
                    };
                }
                
                // Dialogue line: "Speaker: text"
                // Handles: A:, B:, Host:, Guest:, Mr. Lam:, Narrator:, etc.
                const dialogueMatch = trimmed.match(/^([A-Za-z][A-Za-z.]*(?:\s+[A-Za-z]+)?):\s*(.+)$/);
                if (dialogueMatch) {
                    currentSegment.lines.push({
                        speaker: dialogueMatch[1].trim(),
                        text: dialogueMatch[2].trim()
                    });
                } else {
                    // Monologue / narration line
                    currentSegment.lines.push({
                        speaker: 'Narrator',
                        text: trimmed.replace(/\*\*/g, '')
                    });
                }
            }
            
            // Push final segment
            if (currentSegment && currentSegment.lines.length > 0) {
                segments.push(currentSegment);
            }
            
            console.log('[Parser] Parsed', segments.length, 'segments across sections');
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
    const [isPaused, setIsPaused] = useState(false);
    const [rateLimitInfo, setRateLimitInfo] = useState<{failedKeyLast4:string;remainingSegments:string[];errorMessage:string;}|null>(null);
    const [showRateLimitModal, setShowRateLimitModal] = useState(false);
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
    const pauseRef = useRef(false);

    // Voice preview
    const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
    const voicePreviewCache = useRef<Map<string, Blob>>(new Map());
    const currentAudioRef = useRef<HTMLAudioElement | null>(null);

    // Progress persistence
    const saveProgress = () => { localStorage.setItem("tts_progress", JSON.stringify({segments, voiceMapping, fileName, timestamp: Date.now()})); };
    const loadProgress = () => { try { return JSON.parse(localStorage.getItem("tts_progress") || "null"); } catch { return null; } };
    const clearProgress = () => localStorage.removeItem("tts_progress");

    // Pause handlers
    const handlePause = () => { setIsPaused(true); pauseRef.current = true; setStatus("Paused"); saveProgress(); };
    const handleResume = () => { setIsPaused(false); pauseRef.current = false; setShowRateLimitModal(false); setRateLimitInfo(null); };
    const triggerRateLimitPause = (key, msg) => { const remaining = segments.filter(s => s.status !== "completed").map(s => s.name || s.id); setRateLimitInfo({ failedKeyLast4: key.slice(-4), remainingSegments: remaining, errorMessage: msg }); setShowRateLimitModal(true); setIsPaused(true); pauseRef.current = true; saveProgress(); };

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
        const trimmedName = name.trim();
        const lowerName = trimmedName.toLowerCase();

        // Single-letter labels like A, B, C cannot be reliably gender-detected.
        // Return 'unknown' so the UI flags them for manual voice assignment.
        if (/^[A-Z]$/.test(trimmedName)) return 'unknown';

        const femalePatterns = [
            /\b(mrs|ms|miss|lady|woman|girl|mother|mom|mum|aunt|grandma|grandmother|sister|daughter|queen|princess|sophie|sarah|mary|jane|lisa|emma|olivia|ava|isabella|mia|charlotte|amelia|harper|evelyn|anna|chloe|mai|lan|hong|linh|kim|hoa|nga|thao|huong|jessica|jennifer|emily|nicole|female|nutritionist|child)\b/,
            /^(she|her)$/
        ];
        const malePatterns = [
            /\b(mr|sir|man|boy|father|dad|pop|uncle|grandpa|grandfather|brother|son|king|prince|leo|liam|mark|john|james|robert|michael|william|david|richard|joseph|thomas|charles|ben|tom|peter|paul|george|henry|frank|sam|jack|alex|chris|mike|joe|dan|steve|nick|tim|tony|andrew|kevin|brian|ethan|noah|oliver|jacob|lucas|mason|logan|ryan|nathan|kyle|hung|nam|minh|narrator|interviewer|host|guest|male|teacher|student|speaker)\b/,
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

    const handlePreviewVoice = async (voice: string) => {
        if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current.src = '';
            currentAudioRef.current = null;
        }
        if (previewingVoice === voice) { setPreviewingVoice(null); return; }

        const apiKeys = apiKey.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
        if (apiKeys.length === 0) { alert('Please enter an API key to preview voices.'); return; }

        setPreviewingVoice(voice);
        try {
            let blob: Blob;
            if (voicePreviewCache.current.has(voice)) {
                blob = voicePreviewCache.current.get(voice)!;
            } else {
                const result = await TTSWorker.generateAudio(0,
                    `Hello! I am ${voice}, available as a voice for your audio.`,
                    { apiKey: apiKeys[0], apiKeys, modelName: 'gemini-2.5-flash-preview-tts',
                      voiceName: voice, stylePrompt: '', temperature: 1.0, speed: 1.0, pitch: 0 }
                );
                blob = result.audioBlob;
                voicePreviewCache.current.set(voice, blob);
            }
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            currentAudioRef.current = audio;
            audio.onended = () => { setPreviewingVoice(null); URL.revokeObjectURL(url); };
            audio.onerror = () => { setPreviewingVoice(null); URL.revokeObjectURL(url); };
            await audio.play();
        } catch (err) {
            console.error('[Preview]', err);
            alert(`Voice preview failed: ${err instanceof Error ? err.message : String(err)}`);
            setPreviewingVoice(null);
        }
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

    const VoicePreviewButton = ({ voice }: { voice: string }) => {
        const isLoading = previewingVoice === voice;
        return (
            <button title={`Preview ${voice}`} onClick={() => handlePreviewVoice(voice)}
                disabled={!!previewingVoice && previewingVoice !== voice}
                style={{ width:'28px', height:'28px', borderRadius:'50%', border:'none',
                    background: isLoading ? '#ff9800' : '#4caf50', color:'white',
                    cursor: (!!previewingVoice && previewingVoice !== voice) ? 'not-allowed' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'12px', flexShrink:0,
                    opacity: (!!previewingVoice && previewingVoice !== voice) ? 0.4 : 1,
                    transition:'all 0.2s' }}>
                {isLoading ? '⏳' : '▶'}
            </button>
        );
    };

    return (
        <>
            {/* Rate Limit Modal */}
            {showRateLimitModal && rateLimitInfo && (
                <div className="modal-overlay" style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
                    <div className="rate-limit-modal" style={{background:"#1e1e1e",padding:"24px",borderRadius:"12px",maxWidth:"500px",width:"90%",color:"white"}}>
                        <h3 style={{color:"#ff6b6b",marginTop:0}}>?? Rate Limit Hit</h3>
                        <p>API Key ending in <code style={{background:"#333",padding:"2px 6px",borderRadius:"4px"}}>...{rateLimitInfo.failedKeyLast4}</code> exceeded quota.</p>
                        <p style={{color:"#aaa"}}>{rateLimitInfo.errorMessage}</p>
                        <h4>Remaining Segments ({rateLimitInfo.remainingSegments.length})</h4>
                        <ul style={{maxHeight:"150px",overflow:"auto",background:"#2a2a2a",padding:"12px",borderRadius:"8px"}}>
                            {rateLimitInfo.remainingSegments.slice(0,10).map((name, i) => <li key={i}>{name}</li>)}
                            {rateLimitInfo.remainingSegments.length > 10 && <li>...and {rateLimitInfo.remainingSegments.length - 10} more</li>}
                        </ul>
                        <label style={{display:"block",marginTop:"16px"}}>Update API Keys:</label>
                        <textarea value={apiKey} onChange={(e) => handleApiKeyChange(e.target.value)} style={{width:"100%",height:"60px",marginTop:"8px",background:"#2a2a2a",border:"1px solid #444",borderRadius:"8px",color:"white",padding:"8px"}} />
                        <div style={{marginTop:"16px",display:"flex",gap:"12px"}}>
                            <button onClick={handleResume} style={{flex:1,padding:"12px",background:"#4caf50",color:"white",border:"none",borderRadius:"8px",cursor:"pointer"}}>? Resume Generation</button>
                            <button onClick={() => {setShowRateLimitModal(false); setIsPaused(false);}} style={{padding:"12px",background:"#666",color:"white",border:"none",borderRadius:"8px",cursor:"pointer"}}>Close</button>
                        </div>
                    </div>
                </div>
            )}

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
                            {singleSpeakers.length > 0 && (() => {
                                const unknownSingle = singleSpeakers.filter(s => detectGender(s) === 'unknown');
                                return (
                                    <div style={{ marginTop: '15px', padding: '10px', background: '#2a2a2a', borderRadius: '4px' }}>
                                        <h4 style={{ marginTop: 0, marginBottom: '10px' }}>Detected Speakers &amp; Voices</h4>
                                        {unknownSingle.length > 0 && (
                                            <div style={{
                                                marginBottom: '12px',
                                                padding: '9px 13px',
                                                background: '#2a2000',
                                                border: '1px solid #b8860b',
                                                borderRadius: '6px',
                                                color: '#ffd700',
                                                fontSize: '0.88em',
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: '8px'
                                            }}>
                                                <span style={{ fontSize: '1.1em', flexShrink: 0 }}>⚠️</span>
                                                <span>
                                                    <strong>Voice not auto-detected for: {unknownSingle.join(', ')}</strong>
                                                    <br />
                                                    Please assign their voices manually below.
                                                </span>
                                            </div>
                                        )}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                                            {singleSpeakers.map(speaker => {
                                                const isUnknown = detectGender(speaker) === 'unknown';
                                                return (
                                                    <div key={speaker} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                        <label style={{ fontSize: '0.9em', color: isUnknown ? '#ffd700' : '#aaa' }}>
                                                            {speaker}{isUnknown ? ' ⚠️' : ''}
                                                        </label>
                                                        <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                                                            <select style={{ flex:1, padding:'5px', borderRadius:'4px', background:'#333', color:'#fff', border: isUnknown ? '1px solid #b8860b' : '1px solid #555' }}
                                                                value={singleVoiceMapping[speaker] || ''}
                                                                onChange={(e) => setSingleVoiceMapping(prev => ({ ...prev, [speaker]: e.target.value }))}
                                                            >
                                                                {voices.map(v => <option key={v} value={v}>{v}</option>)}
                                                            </select>
                                                            <VoicePreviewButton voice={singleVoiceMapping[speaker] || voices[0]} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

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
                                    <>
                                        <button className="btn-secondary" onClick={handleCancel}>Cancel</button>
                                        <button className="btn-secondary" onClick={isPaused ? handleResume : handlePause} style={{marginLeft: 8, background: isPaused ? "#4caf50" : "#ff9800"}}>{isPaused ? "Resume" : "Pause"}</button>
                                    </>
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
                                            
                                            {speakers.length > 0 && (() => {
                                                const unknownSpeakers = speakers.filter(s => detectGender(s) === 'unknown');
                                                return (
                                                    <>
                                                        {unknownSpeakers.length > 0 && (
                                                            <div style={{
                                                                marginBottom: '14px',
                                                                padding: '10px 14px',
                                                                background: '#2a2000',
                                                                border: '1px solid #b8860b',
                                                                borderRadius: '6px',
                                                                color: '#ffd700',
                                                                fontSize: '0.88em',
                                                                display: 'flex',
                                                                alignItems: 'flex-start',
                                                                gap: '8px'
                                                            }}>
                                                                <span style={{ fontSize: '1.1em', flexShrink: 0 }}>⚠️</span>
                                                                <span>
                                                                    <strong>Voice not auto-detected for: {unknownSpeakers.join(', ')}</strong>
                                                                    <br />
                                                                    These speakers couldn't be gender-identified (e.g. single-letter labels like A, B).
                                                                    Please assign their voices manually below before generating.
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="voice-mapping-grid" style={{ marginBottom: '20px' }}>
                                                            {speakers.map(speaker => {
                                                                const isUnknown = detectGender(speaker) === 'unknown';
                                                                return (
                                                                    <div key={speaker} className="voice-mapping-item" style={isUnknown ? { border: '1px solid #b8860b', borderRadius: '4px', padding: '4px' } : {}}>
                                                                        <label style={isUnknown ? { color: '#ffd700' } : {}}>
                                                                            {speaker}{isUnknown ? ' ⚠️' : ''}
                                                                        </label>
                                                                        <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                                                                            <select style={{ flex:1 }}
                                                                                value={voiceMapping[speaker] || ''}
                                                                                onChange={(e) => handleVoiceChange(speaker, e.target.value)}
                                                                            >
                                                                                {voices.map(v => (
                                                                                    <option key={v} value={v}>{v}</option>
                                                                                ))}
                                                                            </select>
                                                                            <VoicePreviewButton voice={voiceMapping[speaker] || voices[0]} />
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                            
                                            <div className="action-buttons">
                                                <button
                                                    className="btn-primary"
                                                    onClick={handleGenerate}
                                                    disabled={isProcessing || segments.every(s => s.status === 'completed')}
                                                >
                                                    {isProcessing ? 'Generating...' : 'Generate All Audio'}
                                                </button>
                                                {isProcessing && (
                                                    <>
                                                        <button className="btn-secondary" onClick={handleCancel}>Cancel</button>
                                                        <button className="btn-secondary" onClick={isPaused ? handleResume : handlePause} style={{marginLeft: 8, background: isPaused ? "#4caf50" : "#ff9800"}}>{isPaused ? "? Resume" : "? Pause"}</button>
                                                    </>
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
                                            
                                            {/* Remaining Segments when paused */}
                                            {isPaused && segments.filter(s => s.status !== "completed").length > 0 && (
                                                <div style={{ marginTop: "15px", padding: "12px", background: "#2a1a1a", borderRadius: "8px", border: "1px solid #ff6b6b" }}>
                                                    <strong style={{ color: "#ff6b6b" }}>? Paused - Remaining Segments ({segments.filter(s => s.status !== "completed").length})</strong>
                                                    <ul style={{ marginTop: "8px", maxHeight: "100px", overflow: "auto", paddingLeft: "20px" }}>
                                                        {segments.filter(s => s.status !== "completed").slice(0, 5).map((s, i) => (
                                                            <li key={i} style={{ color: "#aaa" }}>{s.name || s.id}</li>
                                                        ))}
                                                        {segments.filter(s => s.status !== "completed").length > 5 && (
                                                            <li style={{ color: "#666" }}>...and {segments.filter(s => s.status !== "completed").length - 5} more</li>
                                                        )}
                                                    </ul>
                                                </div>
                                            )}
                                            
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
                                    {speakers.length > 0 && (() => {
                                        const unknownF = speakers.filter(s => detectGender(s) === 'unknown');
                                        return (
                                            <>
                                                {unknownF.length > 0 && (
                                                    <div style={{ marginBottom:'14px', padding:'10px 14px', background:'#2a2000', border:'1px solid #b8860b', borderRadius:'6px', color:'#ffd700', fontSize:'0.88em', display:'flex', alignItems:'flex-start', gap:'8px' }}>
                                                        <span style={{ fontSize:'1.1em', flexShrink:0 }}>⚠️</span>
                                                        <span>
                                                            <strong>Voice not auto-detected for: {unknownF.join(', ')}</strong><br />
                                                            Please assign voices manually below before generating.
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="voice-mapping-grid" style={{ marginBottom:'20px' }}>
                                                    {speakers.map(speaker => {
                                                        const isUnkF = detectGender(speaker) === 'unknown';
                                                        return (
                                                            <div key={speaker} className="voice-mapping-item" style={isUnkF ? { border:'1px solid #b8860b', borderRadius:'4px', padding:'4px' } : {}}>
                                                                <label style={isUnkF ? { color:'#ffd700' } : {}}>{speaker}{isUnkF ? ' ⚠️' : ''}</label>
                                                                <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                                                                    <select style={{ flex:1 }} value={voiceMapping[speaker] || ''} onChange={(e) => handleVoiceChange(speaker, e.target.value)}>
                                                                        {voices.map(v => <option key={v} value={v}>{v}</option>)}
                                                                    </select>
                                                                    <VoicePreviewButton voice={voiceMapping[speaker] || voices[0]} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        );
                                    })()}

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
        </>
    );
}

export default App;















const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Check if already patched
if (content.includes('isPaused')) {
    console.log('Already has pause feature!');
    process.exit(0);
}

// 1. Add new state variables after isProcessing state
const stateInsertPoint = `    const [isProcessing, setIsProcessing] = useState(false);`;
const newStates = `    const [isProcessing, setIsProcessing] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [rateLimitInfo, setRateLimitInfo] = useState<{
        failedKeyLast4: string;
        remainingSegments: string[];
        errorMessage: string;
    } | null>(null);
    const [showRateLimitModal, setShowRateLimitModal] = useState(false);`;

content = content.replace(stateInsertPoint, newStates);

// 2. Add progress persistence functions after the App function starts
const afterRefsPoint = `    const abortControllerRef = useRef<AbortController | null>(null);`;
const persistenceFunctions = `    const abortControllerRef = useRef<AbortController | null>(null);
    const pauseRef = useRef(false);

    // Progress persistence
    const saveProgress = (segs: ScriptSegment[], mapping: Record<string, string>, name: string) => {
        const progress = {
            segments: segs,
            voiceMapping: mapping,
            fileName: name,
            timestamp: Date.now()
        };
        localStorage.setItem('tts_batch_progress', JSON.stringify(progress));
        console.log('[Progress] Saved to localStorage');
    };

    const loadProgress = () => {
        const saved = localStorage.getItem('tts_batch_progress');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch { return null; }
        }
        return null;
    };

    const clearProgress = () => {
        localStorage.removeItem('tts_batch_progress');
        console.log('[Progress] Cleared from localStorage');
    };

    // Check for saved progress on mount
    useEffect(() => {
        const saved = loadProgress();
        if (saved && saved.segments && saved.segments.some((s: ScriptSegment) => s.status !== 'completed')) {
            const incomplete = saved.segments.filter((s: ScriptSegment) => s.status !== 'completed').length;
            if (window.confirm(\`Found ${incomplete} incomplete segments from previous session. Resume?\`)) {
                setSegments(saved.segments);
                setVoiceMapping(saved.voiceMapping);
                setFileName(saved.fileName);
                setTotal(saved.segments.length);
                const uniqueSpeakers = new Set<string>();
                saved.segments.forEach((seg: ScriptSegment) => {
                    seg.lines.forEach((line: ScriptLine) => uniqueSpeakers.add(line.speaker));
                });
                setSpeakers(Array.from(uniqueSpeakers));
                setStatus(\`Resumed: ${saved.segments.filter((s: ScriptSegment) => s.status === 'completed').length}/${saved.segments.length} completed\`);
            } else {
                clearProgress();
            }
        }
    }, []);

    // Handle pause
    const handlePause = () => {
        setIsPaused(true);
        pauseRef.current = true;
        setStatus('Paused - click Resume to continue');
    };

    const handleResume = () => {
        setIsPaused(false);
        pauseRef.current = false;
        setShowRateLimitModal(false);
        setRateLimitInfo(null);
        setStatus('Resuming...');
    };

    const showRateLimitPause = (failedKey: string, errorMsg: string) => {
        const remaining = segments.filter(s => s.status !== 'completed').map(s => s.name || s.id);
        setRateLimitInfo({
            failedKeyLast4: failedKey.slice(-4),
            remainingSegments: remaining,
            errorMessage: errorMsg
        });
        setShowRateLimitModal(true);
        setIsPaused(true);
        pauseRef.current = true;
    };`;

content = content.replace(afterRefsPoint, persistenceFunctions);

fs.writeFileSync('src/App.tsx', content);
console.log('SUCCESS: Added pause/resume state and functions!');
console.log('Next: Add UI components and modify batch generation loop');


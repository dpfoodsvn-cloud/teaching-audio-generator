const fs = require('fs');
let c = fs.readFileSync('src/App.tsx', 'utf8');
if (c.includes('saveProgress')) { console.log('exists'); process.exit(0); }
const o = 'const pauseRef = useRef(false);';
const funcs = 

    // Progress persistence
    const saveProgress = () => { 
        localStorage.setItem('tts_progress', JSON.stringify({segments, voiceMapping, fileName, timestamp: Date.now()})); 
    };
    const loadProgress = () => { 
        try { return JSON.parse(localStorage.getItem('tts_progress') || 'null'); } 
        catch { return null; } 
    };
    const clearProgress = () => localStorage.removeItem('tts_progress');

    // Pause handlers
    const handlePause = () => { 
        setIsPaused(true); 
        pauseRef.current = true; 
        setStatus('Paused - click Resume to continue'); 
        saveProgress(); 
    };
    const handleResume = () => { 
        setIsPaused(false); 
        pauseRef.current = false; 
        setShowRateLimitModal(false); 
        setRateLimitInfo(null); 
    };
    const triggerRateLimitPause = (key, msg) => {
        const remaining = segments.filter(s => s.status !== 'completed').map(s => s.name || s.id);
        setRateLimitInfo({ failedKeyLast4: key.slice(-4), remainingSegments: remaining, errorMessage: msg });
        setShowRateLimitModal(true); 
        setIsPaused(true); 
        pauseRef.current = true; 
        saveProgress();
    };;
const n = o + funcs;
if (c.includes(o)) {
    c = c.replace(o, n);
    fs.writeFileSync('src/App.tsx', c);
    console.log('SUCCESS: Added functions');
} else {
    console.log('Pattern not found');
}

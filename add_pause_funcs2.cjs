const fs = require("fs");
let c = fs.readFileSync("src/App.tsx", "utf8");
if (c.includes("saveProgress")) { console.log("exists"); process.exit(0); }
const o = "const pauseRef = useRef(false);";
const funcs = "\n\n    // Progress persistence\n    const saveProgress = () => { localStorage.setItem(\"tts_progress\", JSON.stringify({segments, voiceMapping, fileName, timestamp: Date.now()})); };\n    const loadProgress = () => { try { return JSON.parse(localStorage.getItem(\"tts_progress\") || \"null\"); } catch { return null; } };\n    const clearProgress = () => localStorage.removeItem(\"tts_progress\");\n\n    // Pause handlers\n    const handlePause = () => { setIsPaused(true); pauseRef.current = true; setStatus(\"Paused\"); saveProgress(); };\n    const handleResume = () => { setIsPaused(false); pauseRef.current = false; setShowRateLimitModal(false); setRateLimitInfo(null); };\n    const triggerRateLimitPause = (key, msg) => { const remaining = segments.filter(s => s.status !== \"completed\").map(s => s.name || s.id); setRateLimitInfo({ failedKeyLast4: key.slice(-4), remainingSegments: remaining, errorMessage: msg }); setShowRateLimitModal(true); setIsPaused(true); pauseRef.current = true; saveProgress(); };";
const n = o + funcs;
if (c.includes(o)) { c = c.replace(o, n); fs.writeFileSync("src/App.tsx", c); console.log("SUCCESS"); } else { console.log("not found"); }

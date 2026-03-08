const fs = require("fs");
let c = fs.readFileSync("src/App.tsx", "utf8");

// The issue: two buttons are directly adjacent without a wrapper
// Line 1162-1167 area
const old = `{isProcessing && (
                                    <button className="btn-secondary" onClick={handleCancel}>
                                        Cancel
                                    </button>
                                                    <button className="btn-secondary" onClick={isPaused ? handleResume : handlePause} style={{marginLeft: 8, background: isPaused ? "#4caf50" : "#ff9800"}}>{isPaused ? "? Resume" : "? Pause"}</button>
                                )}`;

const fixed = `{isProcessing && (
                                    <>
                                        <button className="btn-secondary" onClick={handleCancel}>Cancel</button>
                                        <button className="btn-secondary" onClick={isPaused ? handleResume : handlePause} style={{marginLeft: 8, background: isPaused ? "#4caf50" : "#ff9800"}}>{isPaused ? "Resume" : "Pause"}</button>
                                    </>
                                )}`;

if (c.includes(old)) {
    c = c.replace(old, fixed);
    fs.writeFileSync("src/App.tsx", c);
    console.log("SUCCESS!");
} else {
    console.log("Not found - checking variants");
    // Log a portion to debug
    const idx = c.indexOf("handleCancel");
    if (idx > 0) {
        console.log("Found handleCancel at index", idx);
        console.log("Context:", c.substring(idx-50, idx+200));
    }
}

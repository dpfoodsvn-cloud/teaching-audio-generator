const fs = require("fs");
let lines = fs.readFileSync("src/App.tsx", "utf8").split(/\r?\n/);

// Find line 1302 (0-indexed: 1301) with {isProcessing && (
// Replace lines 1301-1305 with properly wrapped buttons
const newContent = [
    "                                                {isProcessing && (",
    "                                                    <>",
    "                                                        <button className=\"btn-secondary\" onClick={handleCancel}>Cancel</button>",
    "                                                        <button className=\"btn-secondary\" onClick={isPaused ? handleResume : handlePause} style={{marginLeft: 8, background: isPaused ? \"#4caf50\" : \"#ff9800\"}}>{isPaused ? \"? Resume\" : \"? Pause\"}</button>",
    "                                                    </>",
    "                                                )}"
];

if (lines[1301] && lines[1301].includes("{isProcessing && (")) {
    lines.splice(1301, 5, ...newContent);
    fs.writeFileSync("src/App.tsx", lines.join("\n"));
    console.log("SUCCESS: Added Pause button to Batch Mode");
} else {
    console.log("Line 1302:", lines[1301]);
    console.log("Looking for alternative location...");
    // Search for the pattern
    for (let i = 1280; i < 1320; i++) {
        if (lines[i] && lines[i].includes("{isProcessing && (") && lines[i+1] && lines[i+1].includes("handleCancel")) {
            console.log("Found at line", i+1);
        }
    }
}

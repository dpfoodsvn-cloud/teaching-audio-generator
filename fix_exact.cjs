const fs = require("fs");
let lines = fs.readFileSync("src/App.tsx", "utf8").split(/\r?\n/);

// Lines 1162-1167 (0-indexed: 1161-1166)
// Replace lines 1161 to 1166 inclusive
const newContent = [
    "                                {isProcessing && (",
    "                                    <>",
    "                                        <button className=\"btn-secondary\" onClick={handleCancel}>Cancel</button>",
    "                                        <button className=\"btn-secondary\" onClick={isPaused ? handleResume : handlePause} style={{marginLeft: 8, background: isPaused ? \"#4caf50\" : \"#ff9800\"}}>{isPaused ? \"Resume\" : \"Pause\"}</button>",
    "                                    </>",
    "                                )}"
];

// Check if line 1161 (0-indexed) matches what we expect
if (lines[1161] && lines[1161].includes("{isProcessing && (")) {
    // Replace lines 1161-1166 (6 lines) with our new 6 lines
    lines.splice(1161, 6, ...newContent);
    fs.writeFileSync("src/App.tsx", lines.join("\n"));
    console.log("SUCCESS: Fixed lines 1162-1167");
} else {
    console.log("Line 1162 content:", lines[1161]);
    console.log("Did not match expected pattern");
}

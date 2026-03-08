const fs = require("fs");
let lines = fs.readFileSync("src/App.tsx", "utf8").split(/\r?\n/);

// Find line with handleCancel button (should be around 1163)
let cancelIdx = -1;
let pauseIdx = -1;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("onClick={handleCancel}")) {
        cancelIdx = i;
    }
    if (lines[i].includes("handlePause}") && lines[i].includes("handleResume")) {
        pauseIdx = i;
    }
}

console.log("Cancel button line:", cancelIdx+1);
console.log("Pause button line:", pauseIdx+1);

if (cancelIdx > 0 && pauseIdx > 0 && pauseIdx >= cancelIdx) {
    // Check if already wrapped
    if (lines[cancelIdx].includes("<>") || lines[cancelIdx-1].includes("<>")) {
        console.log("Already wrapped");
        process.exit(0);
    }
    
    // Get the indentation
    const indent = lines[cancelIdx].match(/^(\s*)/)[1];
    
    // Replace the lines
    const newLines = [
        indent + "<>",
        indent + "    <button className=\"btn-secondary\" onClick={handleCancel}>Cancel</button>",
        indent + "    <button className=\"btn-secondary\" onClick={isPaused ? handleResume : handlePause} style={{marginLeft: 8, background: isPaused ? \"#4caf50\" : \"#ff9800\"}}>{isPaused ? \"Resume\" : \"Pause\"}</button>",
        indent + "</>"
    ];
    
    // Remove old lines and insert new ones
    lines.splice(cancelIdx, pauseIdx - cancelIdx + 1, ...newLines);
    
    fs.writeFileSync("src/App.tsx", lines.join("\n"));
    console.log("SUCCESS: Fixed lines", cancelIdx+1, "to", pauseIdx+1);
} else {
    console.log("Could not find the lines to fix");
}

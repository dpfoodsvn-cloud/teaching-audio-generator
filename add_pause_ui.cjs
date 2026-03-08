const fs = require("fs");
let c = fs.readFileSync("src/App.tsx", "utf8");

// Check if pause button already exists (more than 1 occurrence of handlePause)
const matches = c.match(/handlePause/g);
if (matches && matches.length > 1) { console.log("pause btn exists"); process.exit(0); }

// Find the Cancel button and add Pause button after it
const cancelBtn = /(<button className="btn-secondary" onClick=\{handleCancel\}>[\s\S]*?Cancel[\s\S]*?<\/button>)/;
const match = c.match(cancelBtn);
if (match) {
    const newBtns = match[0] + "\n                                                    <button className=\"btn-secondary\" onClick={isPaused ? handleResume : handlePause} style={{marginLeft: 8, background: isPaused ? \"#4caf50\" : \"#ff9800\"}}>{isPaused ? \"? Resume\" : \"? Pause\"}</button>";
    c = c.replace(match[0], newBtns);
    fs.writeFileSync("src/App.tsx", c);
    console.log("SUCCESS: Added pause button");
} else {
    console.log("Cancel button pattern not found");
}

const fs = require("fs");
let c = fs.readFileSync("src/App.tsx", "utf8");

// Find the problematic section and fix it
const oldPattern = /<button className="btn-secondary" onClick=\{handleCancel\}>\s*Cancel\s*<\/button>\s*<button className="btn-secondary" onClick=\{isPaused/;

if (oldPattern.test(c)) {
    // Replace the two adjacent buttons with a properly wrapped version
    c = c.replace(
        /(<button className="btn-secondary" onClick=\{handleCancel\}>)\s*Cancel\s*(<\/button>)\s*(<button className="btn-secondary" onClick=\{isPaused)/,
        "<>\n                                        $1Cancel$2\n                                        $3"
    );
    
    // Find the closing of the pause button and add </> after it
    c = c.replace(
        /(\{isPaused \? ".*Resume.*" : ".*Pause.*"\}<\/button>)(\s*\)}/,
        "$1\n                                    </>$2"
    );
    
    fs.writeFileSync("src/App.tsx", c);
    console.log("Fixed: Wrapped buttons in fragment");
} else {
    console.log("Pattern not found - checking if already fixed");
    if (c.includes("<>") && c.includes("handleCancel") && c.includes("handlePause")) {
        console.log("Buttons might already be wrapped");
    }
}

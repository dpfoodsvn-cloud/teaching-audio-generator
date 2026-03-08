const fs = require("fs");
let c = fs.readFileSync("src/App.tsx", "utf8");

// Simple fix: wrap the Cancel and Pause buttons in a fragment
const search = `                                    <button className="btn-secondary" onClick={handleCancel}>
                                        Cancel
                                    </button>
                                                    <button className="btn-secondary" onClick={isPaused ? handleResume : handlePause}`;

const replace = `                                    <>
                                        <button className="btn-secondary" onClick={handleCancel}>Cancel</button>
                                        <button className="btn-secondary" onClick={isPaused ? handleResume : handlePause}`;

if (c.includes(search)) {
    c = c.replace(search, replace);
    // Also need to close the fragment
    const closeSearch = `{isPaused ? "? Resume" : "? Pause"}</button>
                                )}`;
    const closeReplace = `{isPaused ? "Resume" : "Pause"}</button>
                                    </>
                                )}`;
    c = c.replace(closeSearch, closeReplace);
    fs.writeFileSync("src/App.tsx", c);
    console.log("Fixed!");
} else {
    console.log("Pattern not found");
}

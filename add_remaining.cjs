const fs = require("fs");
let c = fs.readFileSync("src/App.tsx", "utf8");

// Add a remaining segments display after the progress bar
const progressBar = `{/* Progress */}
                                            {segments.length > 0 && (`;

const newProgressWithRemaining = `{/* Progress */}
                                            {segments.length > 0 && (`;

// Check if remaining display already exists
if (c.includes("Remaining segments")) {
    console.log("Already has remaining display");
    process.exit(0);
}

// Find where to add the remaining segments list - after the progress section
const searchPattern = `{segments.length > 0 && (
                                                <div style={{ marginTop:`;

if (c.includes(searchPattern)) {
    // Add remaining segments display before the progress section
    const insertBefore = `{/* Progress */}`;
    const insertContent = `{/* Remaining Segments when paused */}
                                            {isPaused && segments.filter(s => s.status !== "completed").length > 0 && (
                                                <div style={{ marginTop: "15px", padding: "12px", background: "#2a1a1a", borderRadius: "8px", border: "1px solid #ff6b6b" }}>
                                                    <strong style={{ color: "#ff6b6b" }}>? Paused - Remaining Segments ({segments.filter(s => s.status !== "completed").length})</strong>
                                                    <ul style={{ marginTop: "8px", maxHeight: "100px", overflow: "auto", paddingLeft: "20px" }}>
                                                        {segments.filter(s => s.status !== "completed").slice(0, 5).map((s, i) => (
                                                            <li key={i} style={{ color: "#aaa" }}>{s.name || s.id}</li>
                                                        ))}
                                                        {segments.filter(s => s.status !== "completed").length > 5 && (
                                                            <li style={{ color: "#666" }}>...and {segments.filter(s => s.status !== "completed").length - 5} more</li>
                                                        )}
                                                    </ul>
                                                </div>
                                            )}
                                            
                                            {/* Progress */}`;
    
    c = c.replace(insertBefore, insertContent);
    fs.writeFileSync("src/App.tsx", c);
    console.log("SUCCESS: Added remaining segments display");
} else {
    console.log("Pattern not found");
}

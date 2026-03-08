const fs = require("fs");
let c = fs.readFileSync("src/App.tsx", "utf8");

if (c.includes("rate-limit-modal")) { console.log("modal exists"); process.exit(0); }

// Find the return statement and add modal at the beginning
const returnStart = "return (";
const modalJsx = `return (
        <>
            {/* Rate Limit Modal */}
            {showRateLimitModal && rateLimitInfo && (
                <div className="modal-overlay" style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
                    <div className="rate-limit-modal" style={{background:"#1e1e1e",padding:"24px",borderRadius:"12px",maxWidth:"500px",width:"90%",color:"white"}}>
                        <h3 style={{color:"#ff6b6b",marginTop:0}}>?? Rate Limit Hit</h3>
                        <p>API Key ending in <code style={{background:"#333",padding:"2px 6px",borderRadius:"4px"}}>...{rateLimitInfo.failedKeyLast4}</code> exceeded quota.</p>
                        <p style={{color:"#aaa"}}>{rateLimitInfo.errorMessage}</p>
                        <h4>Remaining Segments ({rateLimitInfo.remainingSegments.length})</h4>
                        <ul style={{maxHeight:"150px",overflow:"auto",background:"#2a2a2a",padding:"12px",borderRadius:"8px"}}>
                            {rateLimitInfo.remainingSegments.slice(0,10).map((name, i) => <li key={i}>{name}</li>)}
                            {rateLimitInfo.remainingSegments.length > 10 && <li>...and {rateLimitInfo.remainingSegments.length - 10} more</li>}
                        </ul>
                        <label style={{display:"block",marginTop:"16px"}}>Update API Keys:</label>
                        <textarea value={apiKey} onChange={(e) => handleApiKeyChange(e.target.value)} style={{width:"100%",height:"60px",marginTop:"8px",background:"#2a2a2a",border:"1px solid #444",borderRadius:"8px",color:"white",padding:"8px"}} />
                        <div style={{marginTop:"16px",display:"flex",gap:"12px"}}>
                            <button onClick={handleResume} style={{flex:1,padding:"12px",background:"#4caf50",color:"white",border:"none",borderRadius:"8px",cursor:"pointer"}}>? Resume Generation</button>
                            <button onClick={() => {setShowRateLimitModal(false); setIsPaused(false);}} style={{padding:"12px",background:"#666",color:"white",border:"none",borderRadius:"8px",cursor:"pointer"}}>Close</button>
                        </div>
                    </div>
                </div>
            )}
`;

if (c.includes(returnStart)) {
    c = c.replace(returnStart, modalJsx);
    fs.writeFileSync("src/App.tsx", c);
    console.log("SUCCESS: Added modal");
} else {
    console.log("return not found");
}

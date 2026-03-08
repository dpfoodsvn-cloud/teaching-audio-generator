import asyncio
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import edge_tts
import uvicorn
import io

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TTSRequest(BaseModel):
    text: str
    voice: str
    rate: str = "+0%"
    pitch: str = "+0Hz"

@app.get("/api/edge-tts/voices")
async def get_voices():
    try:
        voices = await edge_tts.list_voices()
        return voices
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/edge-tts")
async def generate_tts(request: TTSRequest):
    try:
        communicate = edge_tts.Communicate(
            text=request.text, 
            voice=request.voice, 
            rate=request.rate, 
            pitch=request.pitch
        )
        
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
                
        if not audio_data:
            raise HTTPException(status_code=500, detail="No audio received")

        return Response(content=audio_data, media_type="audio/mpeg")
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)

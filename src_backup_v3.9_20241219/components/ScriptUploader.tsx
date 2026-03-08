import React, { useState, useRef } from 'react';
import { ScriptParser } from '../core/ScriptParserService';
import type { ScriptSegment } from '../core/types';
import './ScriptUploader.css';

interface ScriptUploaderProps {
    onProcess: (segments: ScriptSegment[], mapping: Record<string, string>, fileName: string) => void;
    voices: string[];
}

export const ScriptUploader: React.FC<ScriptUploaderProps> = ({ onProcess, voices }) => {
    const [file, setFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const [segments, setSegments] = useState<ScriptSegment[]>([]);
    const [speakers, setSpeakers] = useState<string[]>([]);
    const [voiceMapping, setVoiceMapping] = useState<Record<string, string>>({});
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (selectedFile: File) => {
        setFile(selectedFile);
        // Remove extension from filename for default ZIP name
        const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
        setFileName(nameWithoutExt);

        const text = await selectedFile.text();
        const parsedSegments = ScriptParser.parse(text);
        setSegments(parsedSegments);

        // Extract unique speakers
        const uniqueSpeakers = new Set<string>();
        parsedSegments.forEach(seg => {
            seg.lines.forEach(line => uniqueSpeakers.add(line.speaker));
        });
        const speakerList = Array.from(uniqueSpeakers);
        setSpeakers(speakerList);

        // Initialize mapping with default voice
        const initialMapping: Record<string, string> = {};
        speakerList.forEach(speaker => {
            initialMapping[speaker] = voices[0] || '';
        });
        setVoiceMapping(initialMapping);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    const handleVoiceChange = (speaker: string, voice: string) => {
        setVoiceMapping(prev => ({
            ...prev,
            [speaker]: voice
        }));
    };

    return (
        <div className="script-uploader">
            {!file ? (
                <div
                    className={`drop-zone ${isDragging ? 'dragging' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                        accept=".txt,.md,.rtf"
                        hidden
                    />
                    <p>Drag & drop your script template here, or click to select</p>
                    <span className="file-hint">Supported format: .txt (Custom Template)</span>
                </div>
            ) : (
                <div className="mapping-interface">
                    <div className="file-info">
                        <span>📄 {file.name}</span>
                        <button className="change-file-btn" onClick={() => setFile(null)}>Change File</button>
                    </div>

                    <div className="stats-preview">
                        <div className="stat-item">
                            <span className="stat-label">Segments</span>
                            <span className="stat-value">{segments.length}</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">Speakers</span>
                            <span className="stat-value">{speakers.length}</span>
                        </div>
                    </div>

                    <div className="voice-mapper">
                        <h3>Voice Mapping</h3>
                        <p className="mapper-hint">Assign a voice to each speaker found in the script.</p>

                        <div className="mapping-grid">
                            {speakers.map(speaker => (
                                <div key={speaker} className="mapping-row">
                                    <span className="speaker-name">{speaker}</span>
                                    <select
                                        value={voiceMapping[speaker]}
                                        onChange={(e) => handleVoiceChange(speaker, e.target.value)}
                                    >
                                        {voices.map(v => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button
                        className="process-btn"
                        onClick={() => onProcess(segments, voiceMapping, fileName)}
                    >
                        Generate Audio for {segments.length} Segments
                    </button>
                </div>
            )}
        </div>
    );
};

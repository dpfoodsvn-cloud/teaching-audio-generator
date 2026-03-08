import React, { useRef } from 'react';
import './MainPanel.css';

interface Project {
    id: string;
    name: string;
    created: string;
    text: string;
    settings: any;
}

interface MainPanelProps {
    text: string;
    setText: (value: string) => void;
    splitSize: number;
    setSplitSize: (value: number) => void;
    concurrency: number;
    setConcurrency: (value: number) => void;
    delay: number;
    setDelay: (value: number) => void;
    onGenerate: () => void;
    onCancel: () => void;
    isGenerating: boolean;
    progress: number;
    total: number;
    status: string;
    downloadUrl: string | null;
    downloadFilename: string;
    audioFormat: 'wav' | 'mp3';
    setAudioFormat: (format: 'wav' | 'mp3') => void;
    projects: Project[];
    onSaveProject: (name: string) => void;
    onLoadProject: (project: Project) => void;
    onDeleteProject: (id: string) => void;
    onExportProjects: () => void;
    onImportProjects: (file: File) => void;
}

export const MainPanel: React.FC<MainPanelProps> = ({
    text,
    setText,
    splitSize,
    setSplitSize,
    concurrency,
    setConcurrency,
    delay,
    setDelay,
    onGenerate,
    onCancel,
    isGenerating,
    progress,
    total,
    status,
    downloadUrl,
    downloadFilename,
    audioFormat,
    setAudioFormat,
    projects,
    onSaveProject,
    onLoadProject,
    onDeleteProject,
    onExportProjects,
    onImportProjects,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const projectInputRef = useRef<HTMLInputElement>(null);
    const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
    const currentChunkWords = Math.min(wordCount, splitSize);

    const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setText(event.target?.result as string);
            };
            reader.readAsText(file);
        }
    };

    return (
        <div className="main-panel-content">
            <div className="file-upload-area" onClick={() => fileInputRef.current?.click()}>
                <div className="upload-icon">📁</div>
                <div className="upload-text">Choose .txt file (or paste text below)</div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.rtf"
                    onChange={handleFileLoad}
                    style={{ display: 'none' }}
                />
            </div>

            <div className="form-group">
                <label htmlFor="text-input">Text Content</label>
                <textarea
                    id="text-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste text here or choose a .txt file from above."
                />
                <div className="word-count">
                    Total words: {wordCount} | Words remaining in this section: {currentChunkWords}/{splitSize}
                </div>
            </div>

            <div className="controls-row">
                <div className="form-group-inline">
                    <label htmlFor="split-size">Word Count (By word count)</label>
                    <input
                        id="split-size"
                        type="number"
                        value={splitSize}
                        onChange={(e) => setSplitSize(Number(e.target.value))}
                        min="100"
                        max="1000"
                    />
                </div>

                <div className="form-group-inline">
                    <label htmlFor="concurrency">Concurrent Threads</label>
                    <input
                        id="concurrency"
                        type="range"
                        value={concurrency}
                        onChange={(e) => setConcurrency(Number(e.target.value))}
                        min="1"
                        max="10"
                    />
                    <span className="value-badge">{concurrency}</span>
                </div>

                <div className="form-group-inline">
                    <label htmlFor="delay">Delay Between Requests (ms)</label>
                    <input
                        id="delay"
                        type="range"
                        value={delay}
                        onChange={(e) => setDelay(Number(e.target.value))}
                        min="100"
                        max="30000"
                        step="100"
                    />
                    <span className="value-badge">{delay}</span>
                </div>
            </div>

            {/* Audio Format & Project Management */}
            <div className="controls-row">
                <div className="form-group-inline">
                    <label htmlFor="audio-format">Audio Format</label>
                    <select
                        id="audio-format"
                        value={audioFormat}
                        onChange={(e) => setAudioFormat(e.target.value as 'wav' | 'mp3')}
                    >
                        <option value="wav">WAV (Lossless)</option>
                        <option value="mp3">MP3 (Compressed ~90% smaller)</option>
                    </select>
                </div>

                <div className="form-group-inline">
                    <label>Projects</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className="secondary"
                            onClick={() => {
                                const name = prompt('Project name:');
                                if (name) onSaveProject(name);
                            }}
                            disabled={!text.trim()}
                            title="Save current text and settings"
                        >
                            💾 Save
                        </button>
                        <select
                            onChange={(e) => {
                                const project = projects.find(p => p.id === e.target.value);
                                if (project) onLoadProject(project);
                            }}
                            value=""
                            disabled={projects.length === 0}
                        >
                            <option value="">Load Project...</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="action-buttons">
                <button
                    className="primary execute-btn"
                    onClick={onGenerate}
                    disabled={isGenerating || !text.trim()}
                >
                    ▶ Execute
                </button>
                <button
                    className="secondary cancel-btn"
                    onClick={onCancel}
                    disabled={!isGenerating}
                >
                    ⏸ Cancel
                </button>
                {downloadUrl && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
                        <a
                            href={downloadUrl}
                            download={downloadFilename || `philnguyen-tts-${new Date().getTime()}.wav`}
                            className="primary download-btn"
                            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}
                        >
                            ⬇ Download Audio
                        </a>
                        <span style={{ fontSize: '0.8rem', color: '#888', textAlign: 'center' }}>
                            If filename is missing: <b>Right-click button &gt; "Save Link As..."</b>
                        </span>
                    </div>
                )}
            </div>

            {total > 0 && (
                <div className="progress-section">
                    <h3>Progress</h3>
                    <div className="progress-info">
                        <span>{status}</span>
                        <span className="progress-count">{progress} / {total} chunks</span>
                    </div>
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${(progress / total) * 100}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

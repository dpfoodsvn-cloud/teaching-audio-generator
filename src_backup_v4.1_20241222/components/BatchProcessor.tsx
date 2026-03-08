import React, { useRef, useState } from 'react';
import './BatchProcessor.css';

export interface BatchFile {
    id: string;
    name: string;
    content: string;
    status: 'pending' | 'processing' | 'complete' | 'failed';
    progress: number;
    audioBlob?: Blob;
    error?: string;
}

interface BatchProcessorProps {
    files: BatchFile[];
    onFilesAdd: (files: File[]) => void;
    onFileRemove: (id: string) => void;
    onProcess: () => void;
    onPause: () => void;
    onCancel: () => void;
    onDownload: () => void;
    isProcessing: boolean;
    isPaused: boolean;
}

export const BatchProcessor: React.FC<BatchProcessorProps> = ({
    files,
    onFilesAdd,
    onFileRemove,
    onProcess,
    onPause,
    onCancel,
    onDownload,
    isProcessing,
    isPaused,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.txt'));
        if (droppedFiles.length > 0) {
            onFilesAdd(droppedFiles);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length > 0) {
            onFilesAdd(selectedFiles);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'complete': return '✓';
            case 'processing': return '⏳';
            case 'failed': return '✗';
            default: return '⏸';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'complete': return '#10b981';
            case 'processing': return '#3b82f6';
            case 'failed': return '#ef4444';
            default: return '#94a3b8';
        }
    };

    const completedCount = files.filter(f => f.status === 'complete').length;
    const canProcess = files.length > 0 && !isProcessing;
    const canDownload = completedCount > 0;

    return (
        <div className="batch-processor">
            <div
                className={`drop-zone ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <div className="drop-zone-content">
                    <div className="drop-icon">📁</div>
                    <p className="drop-text">Drag & drop .txt files here</p>
                    <p className="drop-subtext">or click to browse (max 10 files)</p>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.rtf"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                />
            </div>

            {files.length > 0 && (
                <div className="file-list">
                    <div className="file-list-header">
                        <h4>Files ({files.length})</h4>
                        <span className="completed-count">{completedCount}/{files.length} completed</span>
                    </div>

                    {files.map((file) => (
                        <div key={file.id} className={`file-item ${file.status}`}>
                            <div className="file-info">
                                <span
                                    className="file-status-icon"
                                    style={{ color: getStatusColor(file.status) }}
                                >
                                    {getStatusIcon(file.status)}
                                </span>
                                <span className="file-name">{file.name}</span>
                                {file.status === 'processing' && (
                                    <span className="file-progress">{file.progress}%</span>
                                )}
                                {file.error && (
                                    <span className="file-error" title={file.error}>⚠️</span>
                                )}
                            </div>
                            {file.status === 'pending' && !isProcessing && (
                                <button
                                    className="btn-remove"
                                    onClick={() => onFileRemove(file.id)}
                                    title="Remove"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div className="batch-actions">
                <button
                    className="btn-primary"
                    onClick={onProcess}
                    disabled={!canProcess}
                >
                    {isProcessing ? 'Processing...' : '▶ Process All'}
                </button>

                {isProcessing && (
                    <button
                        className="btn-secondary"
                        onClick={onPause}
                    >
                        {isPaused ? '▶ Resume' : '⏸ Pause'}
                    </button>
                )}

                {isProcessing && (
                    <button
                        className="btn-secondary"
                        onClick={onCancel}
                    >
                        ✗ Cancel
                    </button>
                )}

                <button
                    className="btn-primary"
                    onClick={onDownload}
                    disabled={!canDownload}
                >
                    📦 Download ZIP ({completedCount})
                </button>
            </div>
        </div>
    );
};

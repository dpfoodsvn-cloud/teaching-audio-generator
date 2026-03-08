import React, { useState, useEffect, useRef } from 'react';
import './SavePresetModal.css';

interface SavePresetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string) => void;
    initialName?: string;
}

export const SavePresetModal: React.FC<SavePresetModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialName = ''
}) => {
    const [name, setName] = useState(initialName);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            // Focus input after a short delay to allow render
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen, initialName]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            onSave(name.trim());
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h3>Save Preset</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="preset-name">Preset Name</label>
                        <input
                            ref={inputRef}
                            id="preset-name"
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g., Narrator Voice, Excited Pitch"
                            autoComplete="off"
                        />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-save" disabled={!name.trim()}>
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

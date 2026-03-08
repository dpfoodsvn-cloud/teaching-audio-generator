import React from 'react';
import './FavoritesPanel.css';

export interface FavoritePreset {
    id: number;
    name: string;
    voice: string;
    stylePrompt: string;
    temperature: number;
    speed: number;
    pitch: number;
}

interface FavoritesPanelProps {
    favorites: FavoritePreset[];
    onSave: (slotId: number, name: string) => void;
    onLoad: (preset: FavoritePreset) => void;
    onDelete: (slotId: number) => void;
}

export const FavoritesPanel: React.FC<FavoritesPanelProps> = ({
    favorites,
    onSave,
    onLoad,
    onDelete,
}) => {
    const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const handleSaveClick = (slotId: number) => {
        onSave(slotId, ''); // Parent will handle naming via modal
    };

    return (
        <div className="favorites-panel">
            <h3>Favorites Board</h3>
            <div className="favorites-grid">
                {slots.map((slotId) => {
                    const preset = favorites.find(f => f.id === slotId);

                    return (
                        <div key={slotId} className={`favorite-slot ${preset ? 'filled' : 'empty'}`}>
                            <div className="slot-header">
                                <span className="slot-number">#{slotId}</span>
                                <span className="slot-name">{preset?.name || 'Empty Slot'}</span>
                            </div>

                            {preset ? (
                                <div className="slot-details">
                                    <div className="detail-row">
                                        <span className="label">Voice:</span>
                                        <span className="value">{preset.voice}</span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="label">Temp:</span>
                                        <span className="value">{preset.temperature}</span>
                                    </div>
                                    <div className="slot-actions">
                                        <button className="btn-load" onClick={() => onLoad(preset)}>Load</button>
                                        <button className="btn-delete" onClick={() => onDelete(slotId)}>×</button>
                                        <button className="btn-overwrite" onClick={() => handleSaveClick(slotId)} title="Overwrite">↻</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="slot-empty-state">
                                    <button className="btn-save" onClick={() => handleSaveClick(slotId)}>
                                        Save Current Settings
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

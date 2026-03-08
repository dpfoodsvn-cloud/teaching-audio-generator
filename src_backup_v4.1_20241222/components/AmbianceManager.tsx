import React from 'react';
import './AmbianceManager.css';

interface AmbianceManagerProps {
    enabled: boolean;
    setEnabled: (enabled: boolean) => void;
    type: string;
    setType: (type: string) => void;
    volume: number;
    setVolume: (volume: number) => void;
}

const AMBIANCE_TYPES = [
    { value: 'none', label: 'None' },
    { value: 'rain', label: '🌧️ Rain' },
    { value: 'cafe', label: '☕ Cafe' },
    { value: 'ocean', label: '🌊 Ocean Waves' },
    { value: 'forest', label: '🌲 Forest' },
    { value: 'fireplace', label: '🔥 Fireplace' },
    { value: 'whitenoise', label: '📻 White Noise' },
];

export const AmbianceManager: React.FC<AmbianceManagerProps> = ({
    enabled,
    setEnabled,
    type,
    setType,
    volume,
    setVolume,
}) => {
    return (
        <div className="ambiance-manager">
            <h4>Background Ambiance</h4>

            <div className="ambiance-toggle">
                <label>
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                    />
                    <span>Enable Background Ambiance</span>
                </label>
            </div>

            {enabled && (
                <div className="ambiance-controls">
                    <div className="form-group">
                        <label htmlFor="ambiance-type">Ambiance Type</label>
                        <select
                            id="ambiance-type"
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                        >
                            {AMBIANCE_TYPES.map(t => (
                                <option key={t.value} value={t.value}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {type !== 'none' && (
                        <div className="form-group">
                            <label htmlFor="ambiance-volume">
                                Volume: {volume}%
                            </label>
                            <input
                                id="ambiance-volume"
                                type="range"
                                min="0"
                                max="100"
                                value={volume}
                                onChange={(e) => setVolume(Number(e.target.value))}
                            />
                            <div className="volume-markers">
                                <span>0%</span>
                                <span>50%</span>
                                <span>100%</span>
                            </div>
                        </div>
                    )}

                    {type !== 'none' && (
                        <div className="ambiance-info">
                            <p className="info-text">
                                ℹ️ Background ambiance will be mixed with your TTS audio.
                                Adjust volume to ensure speech remains clear.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

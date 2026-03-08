import React from 'react';
import { FavoritesPanel, type FavoritePreset } from './FavoritesPanel';
import './SettingsPanel.css';

interface SettingsPanelProps {
    apiKey: string;
    setApiKey: (value: string) => void;
    apiKeys: string;
    setApiKeys: (value: string) => void;
    model: string;
    setModel: (value: string) => void;
    voice: string;
    setVoice: (value: string) => void;
    stylePrompt: string;
    setStylePrompt: (value: string) => void;
    temperature: number;
    setTemperature: (value: number) => void;
    speed: number;
    setSpeed: (value: number) => void;
    pitch: number;
    setPitch: (value: number) => void;
    concurrency: number;
    setConcurrency: (value: number) => void;
    delay: number;
    setDelay: (value: number) => void;
    favorites: FavoritePreset[];
    onSaveFavorite: (slotId: number) => void;
    onLoadFavorite: (preset: FavoritePreset) => void;
    onDeleteFavorite: (slotId: number) => void;
}

// OFFICIAL Google TTS voices from Google AI Studio (19 voices total)
// Updated for v2.1 with official gender labels and voice characteristics
const GOOGLE_VOICES = [
    { value: 'Achernar', label: 'Achernar (Female) - Soft, Higher pitch' },
    { value: 'Achird', label: 'Achird (Male) - Friendly, Lower middle' },
    { value: 'Alnilam', label: 'Alnilam (Male) - Firm, Lower middle pitch' },
    { value: 'Aoede', label: 'Aoede (Female) - Breezy, Middle pitch' },
    { value: 'Autonoe', label: 'Autonoe (Female) - Bright, Middle pitch' },
    { value: 'Callirrhoe', label: 'Callirrhoe (Female) - Easy-going, Middle pitch' },
    { value: 'Enceladus', label: 'Enceladus (Male) - Breathy, Lower pitch' },
    { value: 'Fenrir', label: 'Fenrir (Male) - Excitable, Lower middle' },
    { value: 'Gacrux', label: 'Gacrux (Female) - Mature, Middle pitch' },
    { value: 'Iapetus', label: 'Iapetus (Male) - Clear, Lower middle pitch' },
    { value: 'Laomedeia', label: 'Laomedeia (Female) - Upbeat, Higher pitch' },
    { value: 'Leda', label: 'Leda (Female) - Youthful, Higher pitch' },
    { value: 'Orus', label: 'Orus (Male) - Firm, Lower middle pitch' },
    { value: 'Pulcherrima', label: 'Pulcherrima (Male) - Forward, Middle pitch' },
    { value: 'Rasalgethi', label: 'Rasalgethi (Male) - Informative, Middle pitch' },
    { value: 'Schedar', label: 'Schedar (Male) - Even, Lower middle pitch' },
    { value: 'Umbriel', label: 'Umbriel (Male) - Easy-going, Lower middle' },
    { value: 'Zephyr', label: 'Zephyr (Female) - Easy-going, Middle pitch' },
    { value: 'Zubenelgenubi', label: 'Zubenelgenubi (Male) - Casual, Lower middle' },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
    apiKey,
    setApiKey,
    apiKeys,
    setApiKeys,
    model,
    setModel,
    voice,
    setVoice,
    stylePrompt,
    setStylePrompt,
    temperature,
    setTemperature,
    speed,
    setSpeed,
    pitch,
    setPitch,
    concurrency,
    setConcurrency,
    delay,
    setDelay,
    favorites,
    onSaveFavorite,
    onLoadFavorite,
    onDeleteFavorite,
}) => {
    return (
        <div className="settings-panel-content">
            <div className="form-group">
                <label htmlFor="api-key">Primary API Key</label>
                <input
                    id="api-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your Google GenAI API key"
                />
            </div>

            <div className="form-group">
                <label htmlFor="api-keys">
                    Additional API Keys (Optional - for rotation)
                    <span className="badge">Rate Limit Solution</span>
                </label>
                <textarea
                    id="api-keys"
                    value={apiKeys}
                    onChange={(e) => setApiKeys(e.target.value)}
                    placeholder="Enter additional API keys, one per line, to rotate between them and avoid rate limits"
                    rows={3}
                />
                <p className="hint">
                    Add multiple API keys (one per line) to automatically rotate between them.
                    This helps avoid rate limits by distributing requests across different keys.
                </p>
                <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f0f9ff', borderRadius: '4px', fontSize: '0.85rem', border: '1px solid #bae6fd' }}>
                    <strong>💡 Pro Tip:</strong> If you hit rate limits (Error 429), try:
                    <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                        <li>Add 2-3 extra API keys here</li>
                        <li>Increase "Delay Between Requests" to 5000ms+</li>
                        <li>Increase "Word Count" split size (fewer requests)</li>
                    </ul>
                </div>
            </div>

            <div className="form-group">
                <label htmlFor="voice">Voice ({GOOGLE_VOICES.length} available)</label>
                <select
                    id="voice"
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                >
                    {GOOGLE_VOICES.map(v => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label htmlFor="model">Model</label>
                <select
                    id="model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                >
                    <option value="gemini-2.5-flash-preview-tts">gemini-2.5-flash-preview-tts</option>
                    <option value="gemini-2.5-pro-preview-tts">gemini-2.5-pro-preview-tts</option>
                </select>
            </div>

            <div className="form-group">
                <label htmlFor="temperature">
                    Temperature
                    <span className="value-display">{temperature}</span>
                </label>
                <input
                    id="temperature"
                    type="range"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    min="0"
                    max="2"
                    step="0.1"
                />
                <p className="hint">Controls randomness in voice generation. Lower = more consistent, Higher = more varied.</p>
            </div>

            <div className="form-group">
                <label htmlFor="speed">Speed (x)</label>
                <input
                    id="speed"
                    type="number"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    min="0.5"
                    max="2"
                    step="0.1"
                />
            </div>

            <div className="form-group">
                <label htmlFor="pitch">
                    Pitch
                    <span className="value-display">{pitch}</span>
                </label>
                <input
                    id="pitch"
                    type="range"
                    value={pitch}
                    onChange={(e) => setPitch(Number(e.target.value))}
                    min="-10"
                    max="10"
                    step="1"
                />
                <p className="hint">Adjust voice pitch (-10 to 10). Default is 0.</p>
            </div>

            <div className="form-group">
                <label htmlFor="concurrency-settings">
                    Concurrent Threads
                    <span className="value-display">{concurrency}</span>
                </label>
                <input
                    id="concurrency-settings"
                    type="range"
                    value={concurrency}
                    onChange={(e) => setConcurrency(Number(e.target.value))}
                    min="1"
                    max="10"
                />
                <p className="hint">Note: Reduce threads if you encounter errors. Increasing threads may speed up processing but can also cause API rate limit errors.</p>
            </div>

            <div className="form-group">
                <label htmlFor="delay-settings">
                    Delay Between Requests (ms)
                    <span className="value-display">{delay}</span>
                </label>
                <input
                    id="delay-settings"
                    type="range"
                    value={delay}
                    onChange={(e) => setDelay(Number(e.target.value))}
                    min="100"
                    max="30000"
                    step="100"
                />
                <p className="hint">Add a small delay between each API request. Increase this value if you encounter rate limit errors.</p>
            </div>

            <div className="form-group">
                <label htmlFor="style">Style Management</label>
                <input
                    id="style"
                    type="text"
                    value={stylePrompt}
                    onChange={(e) => setStylePrompt(e.target.value)}
                    placeholder="Read aloud in a warm and friendly tone."
                />
            </div>

            <FavoritesPanel
                favorites={favorites}
                onSave={onSaveFavorite}
                onLoad={onLoadFavorite}
                onDelete={onDeleteFavorite}
            />
        </div>
    );
};

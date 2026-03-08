import type { TTSEngine } from './TTSEngine';
import { GeminiEngine } from './GeminiEngine';
import { OpenAIEngine } from './OpenAIEngine';
import { ElevenLabsEngine } from './ElevenLabsEngine';
import { EdgeTTSEngine } from './EdgeTTSEngine';
import { BrowserTTSEngine } from './BrowserTTSEngine';

/**
 * Engine Registry — central place to register and retrieve TTS engines.
 * 
 * Adding a new engine:
 * 1. Create engines/MyEngine.ts implementing TTSEngine
 * 2. Import and register below: registry.register(new MyEngine())
 */
class EngineRegistry {
    private engines = new Map<string, TTSEngine>();

    register(engine: TTSEngine): void {
        this.engines.set(engine.id, engine);
        console.log(`[EngineRegistry] Registered: ${engine.name} (${engine.id})`);
    }

    getEngine(id: string): TTSEngine {
        const engine = this.engines.get(id);
        if (!engine) throw new Error(`Engine not found: ${id}`);
        return engine;
    }

    getAllEngines(): TTSEngine[] {
        return Array.from(this.engines.values());
    }

    getEngineNames(): { id: string; name: string; requiresApiKey: boolean; description: string }[] {
        return this.getAllEngines().map(e => ({
            id: e.id,
            name: e.name,
            requiresApiKey: e.requiresApiKey,
            description: e.description,
        }));
    }
}

// Create and populate the global registry
export const engineRegistry = new EngineRegistry();

// Register all built-in engines
engineRegistry.register(new GeminiEngine());
engineRegistry.register(new OpenAIEngine());
engineRegistry.register(new ElevenLabsEngine());
engineRegistry.register(new EdgeTTSEngine());
engineRegistry.register(new BrowserTTSEngine());

export type { TTSEngine } from './TTSEngine';
export type { Voice, EngineConfig } from './TTSEngine';

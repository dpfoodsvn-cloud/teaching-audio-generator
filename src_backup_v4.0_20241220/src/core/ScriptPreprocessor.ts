import { GoogleGenerativeAI } from '@google/generative-ai';

export interface SpeakerInfo {
  name: string;
  detectedGender: 'male' | 'female' | 'unknown';
  suggestedVoice: string;
  lineCount: number;
}

export interface PreprocessResult {
  cleanedContent: string;
  detectedSpeakers: SpeakerInfo[];
  segmentCount: number;
  issues: string[];
  success: boolean;
  error?: string;
}

const MALE_VOICES = ['Zephyr', 'Puck', 'Charon', 'Fenrir'];
const FEMALE_VOICES = ['Kore', 'Aoede'];

export class ScriptPreprocessor {
  private static readonly PREPROCESS_PROMPT = "You are a script formatter for a text-to-speech teaching audio generator.\n\nYour task is to take raw input text and convert it to the standard script format. Fix any formatting issues.\n\nSTANDARD FORMAT:\nSCRIPT ID: [unique identifier]\nSECTION: [section name]\nNAME: [script name]\nDURATION: [estimated duration]\nSPEAKERS: [count] ([speaker names])\n----------------------------------------\n[Speaker]: [Dialogue text]\n[Speaker]: [Dialogue text]\n...\n\nRULES:\n1. Each script segment must start with SCRIPT ID:\n2. Speaker names must be followed by a colon and space\n3. Fix typos in speaker names (keep consistent)\n4. Remove any formatting artifacts (RTF codes, markdown symbols for emphasis)\n5. Keep markdown structure for headers if it helps organization\n6. If no SCRIPT ID exists, generate one (e.g., 01, 02)\n7. Infer DURATION if not provided (estimate based on word count)\n8. Count and list speakers in SPEAKERS field\n\nReturn ONLY the cleaned script, no explanations.";

  private static readonly SPEAKER_ANALYSIS_PROMPT = "Analyze the speakers in this script and determine their likely gender based on:\n1. Common name associations (e.g., Sarah = female, John = male)\n2. Titles (Mr., Mrs., Miss, etc.)\n3. Role descriptions (mother, father, etc.)\n4. Context clues in dialogue\n\nFor each speaker, respond in this JSON format:\n{\n  \"speakers\": [\n    {\"name\": \"Speaker Name\", \"gender\": \"male|female|unknown\", \"reason\": \"brief reason\"}\n  ]\n}\n\nScript to analyze:\n";

  static async preprocess(
    rawContent: string,
    apiKey: string
  ): Promise<PreprocessResult> {
    const result: PreprocessResult = {
      cleanedContent: rawContent,
      detectedSpeakers: [],
      segmentCount: 0,
      issues: [],
      success: false
    };

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      console.log('[Preprocessor] Cleaning script format...');
      const cleanResponse = await model.generateContent([
        this.PREPROCESS_PROMPT,
        'INPUT SCRIPT:\n' + rawContent
      ]);
      
      const cleanedContent = cleanResponse.response.text().trim();
      result.cleanedContent = cleanedContent;
      result.issues.push('Script format standardized');

      const segmentMatches = cleanedContent.match(/SCRIPT ID:/g);
      result.segmentCount = segmentMatches ? segmentMatches.length : 1;

      console.log('[Preprocessor] Analyzing speakers...');
      const speakerResponse = await model.generateContent([
        this.SPEAKER_ANALYSIS_PROMPT + cleanedContent
      ]);
      
      const speakerText = speakerResponse.response.text();
      const jsonMatch = speakerText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        try {
          const speakerData = JSON.parse(jsonMatch[0]);
          const speakerCounts = this.countSpeakerLines(cleanedContent);
          
          result.detectedSpeakers = speakerData.speakers.map((s: any) => ({
            name: s.name,
            detectedGender: s.gender as 'male' | 'female' | 'unknown',
            suggestedVoice: this.suggestVoice(s.gender),
            lineCount: speakerCounts[s.name] || 0
          }));
        } catch (parseError) {
          console.warn('[Preprocessor] Failed to parse speaker JSON, falling back to regex');
          result.detectedSpeakers = this.extractSpeakersManually(cleanedContent);
        }
      } else {
        result.detectedSpeakers = this.extractSpeakersManually(cleanedContent);
      }

      result.success = true;
      console.log('[Preprocessor] Complete:', result.segmentCount, 'segments,', result.detectedSpeakers.length, 'speakers');

    } catch (error) {
      console.error('[Preprocessor] Error:', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.success = false;
      
      result.detectedSpeakers = this.extractSpeakersManually(rawContent);
      result.segmentCount = (rawContent.match(/SCRIPT ID:/g) || []).length || 1;
    }

    return result;
  }

  private static countSpeakerLines(content: string): Record<string, number> {
    const counts: Record<string, number> = {};
    const lines = content.split(/\r?\n/);
    
    for (const line of lines) {
      const match = line.match(/^([^:]+):\s+.+$/);
      if (match) {
        const speaker = match[1].trim();
        if (!['SCRIPT ID', 'SECTION', 'NAME', 'DURATION', 'SPEAKERS'].includes(speaker)) {
          counts[speaker] = (counts[speaker] || 0) + 1;
        }
      }
    }
    
    return counts;
  }

  private static extractSpeakersManually(content: string): SpeakerInfo[] {
    const speakerCounts = this.countSpeakerLines(content);
    const speakers: SpeakerInfo[] = [];
    
    for (const [name, count] of Object.entries(speakerCounts)) {
      const gender = this.detectGender(name);
      speakers.push({
        name,
        detectedGender: gender,
        suggestedVoice: this.suggestVoice(gender),
        lineCount: count
      });
    }
    
    return speakers;
  }

  private static detectGender(name: string): 'male' | 'female' | 'unknown' {
    const lowerName = name.toLowerCase();
    
    const femalePatterns = [
      /\b(mrs|ms|miss|lady|woman|girl|mother|mom|mum|aunt|grandma|grandmother|sister|daughter|queen|princess)\b/,
      /\b(sophie|sarah|mary|jane|lisa|emma|olivia|ava|isabella|mia|charlotte|amelia|harper|evelyn|anna|chloe|emily|jessica|ashley|amanda|nicole|stephanie|jennifer|elizabeth|linda|barbara|susan|margaret|dorothy|helen|nancy|betty|karen|donna|carol|ruth)\b/
    ];
    
    const malePatterns = [
      /\b(mr|sir|man|boy|father|dad|pop|uncle|grandpa|grandfather|brother|son|king|prince)\b/,
      /\b(mark|john|james|robert|michael|william|david|richard|joseph|thomas|charles|daniel|matthew|anthony|donald|steven|paul|andrew|joshua|kenneth|kevin|brian|george|edward|ronald|timothy|jason|jeffrey|ryan|jacob|gary|nicholas|eric|stephen|jonathan|larry|justin|scott|brandon|raymond|frank|benjamin|gregory|samuel|patrick|alexander|jack|henry|zachary|douglas|peter|aaron|walter|jeremy|adam|nathan|harold|arthur|carl|lawrence|ernest|gerald|howard|roger|albert|eugene|joe|wayne|roy|louis|jesse|ralph|billy|johnny|bobby|phillip)\b/
    ];
    
    if (femalePatterns.some(p => p.test(lowerName))) return 'female';
    if (malePatterns.some(p => p.test(lowerName))) return 'male';
    return 'unknown';
  }

  private static suggestVoice(gender: 'male' | 'female' | 'unknown'): string {
    if (gender === 'female') return FEMALE_VOICES[0];
    if (gender === 'male') return MALE_VOICES[0];
    return MALE_VOICES[0];
  }

  static preprocessSimple(rawContent: string): PreprocessResult {
    const speakers = this.extractSpeakersManually(rawContent);
    const segmentCount = (rawContent.match(/SCRIPT ID:/g) || []).length || 1;
    
    return {
      cleanedContent: rawContent,
      detectedSpeakers: speakers,
      segmentCount,
      issues: [],
      success: true
    };
  }
}

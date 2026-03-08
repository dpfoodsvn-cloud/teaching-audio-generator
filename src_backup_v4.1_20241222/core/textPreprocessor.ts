// Text Preprocessor Utility
// Smart preprocessing for better TTS output

export class TextPreprocessor {
    /**
     * Preprocess text for TTS
     * @param text - Raw text
     * @param options - Preprocessing options
     * @returns Preprocessed text
     */
    static preprocess(
        text: string,
        options: {
            numbers?: boolean;
            urls?: boolean;
            emails?: boolean;
            acronyms?: boolean;
            specialChars?: boolean;
        } = {}
    ): string {
        let processed = text;

        // Default: enable all
        const opts = {
            numbers: true,
            urls: true,
            emails: true,
            acronyms: true,
            specialChars: true,
            ...options,
        };

        if (opts.emails) processed = this.processEmails(processed);
        if (opts.urls) processed = this.processUrls(processed);
        if (opts.numbers) processed = this.processNumbers(processed);
        if (opts.acronyms) processed = this.processAcronyms(processed);
        if (opts.specialChars) processed = this.processSpecialChars(processed);

        return processed;
    }

    /**
     * Process numbers
     */
    private static processNumbers(text: string): string {
        // Currency
        text = text.replace(/\$(\d+)\.(\d{2})/g, (_, dollars, cents) => {
            return `${this.numberToWords(parseInt(dollars))} dollars and ${this.numberToWords(parseInt(cents))} cents`;
        });

        // Years (4 digits, 1900-2099)
        text = text.replace(/\b(19|20)(\d{2})\b/g, (match) => {
            const year = parseInt(match);
            const century = Math.floor(year / 100);
            const remainder = year % 100;
            if (remainder === 0) {
                return `${this.numberToWords(century)} hundred`;
            }
            return `${this.numberToWords(century)} ${this.numberToWords(remainder)}`;
        });

        // Regular numbers (1-9999)
        text = text.replace(/\b\d{1,4}\b/g, (match) => {
            return this.numberToWords(parseInt(match));
        });

        return text;
    }

    /**
     * Process URLs
     */
    private static processUrls(text: string): string {
        // http://example.com or https://example.com
        text = text.replace(/https?:\/\/(www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g, (_, www, domain) => {
            return domain.replace(/\./g, ' dot ');
        });

        // www.example.com
        text = text.replace(/www\.([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g, (_, domain) => {
            return domain.replace(/\./g, ' dot ');
        });

        // example.com (standalone)
        text = text.replace(/\b([a-zA-Z0-9-]+\.(com|org|net|edu|gov))\b/g, (match) => {
            return match.replace(/\./g, ' dot ');
        });

        return text;
    }

    /**
     * Process emails
     */
    private static processEmails(text: string): string {
        text = text.replace(/([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (_, user, domain) => {
            return `${user.replace(/\./g, ' dot ')} at ${domain.replace(/\./g, ' dot ')}`;
        });
        return text;
    }

    /**
     * Process acronyms (all caps, 2-6 letters)
     */
    private static processAcronyms(text: string): string {
        text = text.replace(/\b([A-Z]{2,6})\b/g, (match) => {
            // Common exceptions that should NOT be spelled out
            const exceptions = ['OK', 'US', 'UK', 'AM', 'PM', 'AD', 'BC'];
            if (exceptions.includes(match)) {
                return match;
            }
            // Spell out: NASA → N-A-S-A
            return match.split('').join('-');
        });
        return text;
    }

    /**
     * Process special characters
     */
    private static processSpecialChars(text: string): string {
        const replacements: Record<string, string> = {
            '&': ' and ',
            '@': ' at ',
            '#': ' hashtag ',
            '%': ' percent ',
            '+': ' plus ',
            '=': ' equals ',
            '<': ' less than ',
            '>': ' greater than ',
        };

        for (const [char, replacement] of Object.entries(replacements)) {
            text = text.split(char).join(replacement);
        }

        return text;
    }

    /**
     * Convert number to words (1-9999)
     */
    private static numberToWords(num: number): string {
        if (num === 0) return 'zero';

        const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
        const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

        if (num < 10) return ones[num];
        if (num < 20) return teens[num - 10];
        if (num < 100) {
            const ten = Math.floor(num / 10);
            const one = num % 10;
            return tens[ten] + (one ? ' ' + ones[one] : '');
        }
        if (num < 1000) {
            const hundred = Math.floor(num / 100);
            const remainder = num % 100;
            return ones[hundred] + ' hundred' + (remainder ? ' ' + this.numberToWords(remainder) : '');
        }
        if (num < 10000) {
            const thousand = Math.floor(num / 1000);
            const remainder = num % 1000;
            return ones[thousand] + ' thousand' + (remainder ? ' ' + this.numberToWords(remainder) : '');
        }

        return num.toString(); // Fallback for larger numbers
    }
}

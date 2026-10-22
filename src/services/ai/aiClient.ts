// src/services/ai/aiClient.ts

export interface GeminiClientOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

export class GeminiAIClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: GeminiClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.GOOGLE_API_KEY || '';
    this.model = options.model || process.env.AI_MODEL || 'gemini-3.5-flash';
    this.timeoutMs = options.timeoutMs || Number(process.env.AI_TIMEOUT_MS) || 20000;
  }

  async callGemini(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GOOGLE_API_KEY is not configured');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `Gemini API error (HTTP ${response.status}): ${errorText || response.statusText}`
        );
      }

      const data = (await response.json()) as any;
      const candidate = data.candidates?.[0];

      if (!candidate || !candidate.content?.parts?.[0]?.text) {
        throw new Error('Empty response or no candidate returned by Gemini API');
      }

      let text = candidate.content.parts[0].text.trim();

      // Clean up markdown code block wrapping if Gemini outputs it
      if (text.startsWith('```json')) {
        text = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      } else if (text.startsWith('```')) {
        text = text.replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      }

      return text;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`Gemini API request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const aiClient = new GeminiAIClient();

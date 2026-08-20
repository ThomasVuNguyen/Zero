/**
 * AI embedding adapter that replaces Cloudflare Workers AI.
 * Uses OpenRouter (or any OpenAI-compatible API) for generating embeddings.
 *
 * Replaces: env.AI.run('@cf/baai/bge-large-en-v1.5', { text: [...] })
 */
export class AIAdapter {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(config: {
    apiKey: string;
    baseUrl?: string;
    model?: string;
  }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
    this.model = config.model || 'openai/text-embedding-3-small';
  }

  /**
   * Generate embeddings for text input.
   * Mimics the Cloudflare AI.run() API for embedding models.
   */
  async run(
    _modelName: string,
    input: { text: string[] | string },
  ): Promise<{ data: number[][] }> {
    const texts = Array.isArray(input.text) ? input.text : [input.text];

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Embedding API error (${response.status}): ${errorText}`,
      );
    }

    const result = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to maintain order
    const sorted = result.data.sort((a, b) => a.index - b.index);
    return {
      data: sorted.map((item) => item.embedding),
    };
  }

  /**
   * Generate a single embedding vector for a text string.
   * Convenience method for common use case.
   */
  async embed(text: string): Promise<number[]> {
    const result = await this.run('', { text: [text] });
    return result.data[0] || [];
  }

  /**
   * Generate embeddings for multiple texts.
   * Convenience method for batch embedding.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // OpenAI/OpenRouter has a batch limit, chunk if needed
    const chunkSize = 100;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += chunkSize) {
      const chunk = texts.slice(i, i + chunkSize);
      const result = await this.run('', { text: chunk });
      allEmbeddings.push(...result.data);
    }

    return allEmbeddings;
  }
}

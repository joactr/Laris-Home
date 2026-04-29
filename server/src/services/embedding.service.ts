export class EmbeddingService {
  private static extractor: null | ((text: string, options: Record<string, unknown>) => Promise<{ data: ArrayLike<number> }>) = null;

  private static isMockMode() {
    return process.env.NODE_ENV === 'test' || process.env.EMBEDDINGS_PROVIDER === 'mock';
  }

  private static buildMockEmbedding(text: string): number[] {
    const vector = new Array<number>(384).fill(0);
    for (let index = 0; index < text.length; index += 1) {
      vector[index % vector.length] += text.charCodeAt(index) / 255;
    }
    return vector.map((value) => Number(value.toFixed(6)));
  }

  static async getExtractor() {
    if (!this.extractor) {
      if (this.isMockMode()) {
        this.extractor = async (text: string) => ({
          data: this.buildMockEmbedding(text),
        });
        return this.extractor;
      }

      const transformers = await import('@xenova/transformers');
      this.extractor = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return this.extractor;
  }

  static async generate(text: string): Promise<number[]> {
    try {
      const extractor = await this.getExtractor();
      if (!extractor) {
        throw new Error('Embedding extractor unavailable');
      }
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  /**
   * Generates a descriptive text for a recipe to be used for embedding.
   */
  static prepareRecipeText(recipe: { title: string, ingredients: string[], instructions: string }): string {
    const ingredientsText = recipe.ingredients.join(', ');
    // We combine title and ingredients as they are most relevant for search
    // We include a bit of instructions but trimmed to keep focus on key terms
    return `Receta: ${recipe.title}. Ingredientes: ${ingredientsText}. Pasos: ${recipe.instructions.substring(0, 300)}`;
  }
}

// @ts-ignore
import { pipeline } from '@xenova/transformers';

export class EmbeddingService {
  private static extractor: any = null;

  static async getExtractor() {
    if (!this.extractor) {
      // Using a small but effective model: all-MiniLM-L6-v2 (384 dimensions)
      this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return this.extractor;
  }

  static async generate(text: string): Promise<number[]> {
    try {
      const extractor = await this.getExtractor();
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

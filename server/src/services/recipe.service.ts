import pool from '../db/pool';
import { parsedRecipeSchema } from '../contracts/voice';
import { OpenRouterService, ParsedRecipe } from './openrouter.service';
import { EmbeddingService } from './embedding.service';

type ImportedRecipe = ParsedRecipe & { imageUrl?: string | null };

export class RecipeService {
  static async fetchAndParse(url: string): Promise<ImportedRecipe> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const html = await response.text();
    const pageUrl = response.url || url;

    const structuredRecipe = this.extractStructuredRecipe(html, pageUrl);
    const recipe = structuredRecipe ?? await OpenRouterService.parseRecipe(this.extractPageText(html));
    const imageUrl = structuredRecipe?.imageUrl ?? this.extractRecipeImageUrl(html, pageUrl);

    try {
      const macros = await OpenRouterService.calculateMacros(
        recipe.title,
        recipe.ingredients.map(i => i.originalText || i.name),
        recipe.servings || 1
      );
      Object.assign(recipe, macros);
    } catch {
      // Macro enrichment is opportunistic and should not fail imports.
    }

    return {
      ...recipe,
      imageUrl,
    };
  }

  private static extractPageText(html: string) {
    let textContent = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (textContent.length > 10000) {
      textContent = `${textContent.substring(0, 10000)}...`;
    }

    return textContent;
  }

  private static extractStructuredRecipe(html: string, pageUrl: string): ImportedRecipe | null {
    const blocks = this.extractJsonLdBlocks(html);

    for (const block of blocks) {
      const recipeNode = this.findRecipeNode(block);
      if (!recipeNode) {
        continue;
      }

      const normalized = this.normalizeStructuredRecipe(recipeNode, pageUrl);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private static extractJsonLdBlocks(html: string): unknown[] {
    const blocks: unknown[] = [];
    const matches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

    for (const match of matches) {
      const raw = match[1]?.trim();
      if (!raw) {
        continue;
      }

      try {
        blocks.push(JSON.parse(raw));
      } catch {
        continue;
      }
    }

    return blocks;
  }

  private static findRecipeNode(value: unknown): Record<string, unknown> | null {
    if (!value) {
      return null;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findRecipeNode(item);
        if (found) {
          return found;
        }
      }
      return null;
    }

    if (typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const type = record['@type'];
    if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) {
      return record;
    }

    if (record.mainEntity) {
      const found = this.findRecipeNode(record.mainEntity);
      if (found) {
        return found;
      }
    }

    if (Array.isArray(record['@graph'])) {
      const found = this.findRecipeNode(record['@graph']);
      if (found) {
        return found;
      }
    }

    return null;
  }

  private static normalizeStructuredRecipe(value: Record<string, unknown>, pageUrl: string): ImportedRecipe | null {
    const title = this.asString(value.name);
    if (!title) {
      return null;
    }

    const ingredients = this.normalizeIngredients(value.recipeIngredient);
    const instructions = this.normalizeInstructions(value.recipeInstructions);
    if (!ingredients.length || !instructions.length) {
      return null;
    }

    const parsed = parsedRecipeSchema.safeParse({
      title,
      description: this.asString(value.description) || '',
      servings: this.parseYield(value.recipeYield),
      prepTimeMinutes: this.parseDurationMinutes(value.prepTime),
      cookTimeMinutes: this.parseDurationMinutes(value.cookTime),
      ingredients,
      instructions,
    });

    if (!parsed.success) {
      return null;
    }

    return {
      ...parsed.data,
      imageUrl: this.normalizeImageUrl(this.extractImageCandidate(value.image), pageUrl),
    };
  }

  private static extractRecipeImageUrl(html: string, pageUrl: string): string | null {
    const candidates = [
      this.extractMetaImage(html, 'property', 'og:image'),
      this.extractMetaImage(html, 'name', 'og:image'),
      this.extractMetaImage(html, 'name', 'twitter:image'),
      this.extractMetaImage(html, 'property', 'twitter:image'),
      this.extractMetaImage(html, 'itemprop', 'image'),
      this.extractImageFromJsonLd(html),
      this.extractFirstInlineImage(html),
    ];

    for (const candidate of candidates) {
      const resolved = this.normalizeImageUrl(candidate, pageUrl);
      if (resolved) return resolved;
    }

    return null;
  }

  private static extractMetaImage(html: string, attrName: string, attrValue: string): string | null {
    const regex = new RegExp(
      `<meta[^>]*${attrName}=["']${this.escapeRegExp(attrValue)}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      'i'
    );
    const reverseRegex = new RegExp(
      `<meta[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${this.escapeRegExp(attrValue)}["'][^>]*>`,
      'i'
    );

    return regex.exec(html)?.[1] || reverseRegex.exec(html)?.[1] || null;
  }

  private static extractImageFromJsonLd(html: string): string | null {
    for (const block of this.extractJsonLdBlocks(html)) {
      const found = this.findImageInStructuredData(block);
      if (found) return found;
    }

    return null;
  }

  private static extractImageCandidate(value: unknown): string | null {
    if (!value) return null;

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.extractImageCandidate(item);
        if (found) return found;
      }
      return null;
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.url === 'string') {
        return record.url;
      }
    }

    return null;
  }

  private static findImageInStructuredData(value: unknown): string | null {
    if (!value) return null;

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findImageInStructuredData(item);
        if (found) return found;
      }
      return null;
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const type = record['@type'];

      if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) {
        const image = record.image;
        if (typeof image === 'string') return image;
        if (Array.isArray(image)) {
          const firstString = image.find((item): item is string => typeof item === 'string');
          if (firstString) return firstString;
          for (const item of image) {
            if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string') {
              return (item as Record<string, unknown>).url as string;
            }
          }
        }
        if (image && typeof image === 'object' && typeof (image as Record<string, unknown>).url === 'string') {
          return (image as Record<string, unknown>).url as string;
        }
      }

      if (Array.isArray(record['@graph'])) {
        return this.findImageInStructuredData(record['@graph']);
      }
    }

    return null;
  }

  private static extractFirstInlineImage(html: string): string | null {
    const matches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi);

    for (const match of matches) {
      const src = match[1];
      if (!src) continue;
      if (src.startsWith('data:')) continue;
      if (/avatar|icon|logo|sprite|blank/i.test(src)) continue;
      return src;
    }

    return null;
  }

  private static normalizeImageUrl(candidate: string | null | undefined, pageUrl: string): string | null {
    if (!candidate) return null;
    const trimmed = candidate.trim();
    if (!trimmed || trimmed.startsWith('data:')) return null;

    try {
      const normalized = new URL(trimmed, pageUrl).toString();
      if (!/^https?:\/\//i.test(normalized)) return null;
      return normalized;
    } catch {
      return null;
    }
  }

  private static escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private static asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private static parseYield(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const match = value.match(/(\d+(?:[.,]\d+)?)/);
      if (!match) return null;
      return Number(match[1].replace(',', '.'));
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const parsed = this.parseYield(item);
        if (parsed != null) return parsed;
      }
    }

    return null;
  }

  private static parseDurationMinutes(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const iso = trimmed.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i);
    if (iso) {
      const days = Number(iso[1] || 0);
      const hours = Number(iso[2] || 0);
      const minutes = Number(iso[3] || 0);
      return (days * 24 * 60) + (hours * 60) + minutes;
    }

    const numeric = trimmed.match(/(\d+(?:[.,]\d+)?)/);
    if (!numeric) {
      return null;
    }

    return Number(numeric[1].replace(',', '.'));
  }

  private static normalizeIngredients(value: unknown): ParsedRecipe['ingredients'] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.normalizeIngredient(item))
      .filter((item): item is ParsedRecipe['ingredients'][number] => Boolean(item));
  }

  private static normalizeIngredient(value: unknown): ParsedRecipe['ingredients'][number] | null {
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) {
        return null;
      }

      return {
        name: text,
        originalText: text,
        quantity: null,
        unit: null,
        notes: null,
      };
    }

    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const originalText = this.asString(record.text) || this.asString(record.name);
    if (!originalText) {
      return null;
    }

    return {
      name: this.asString(record.name) || originalText,
      originalText,
      quantity: typeof record.amount === 'number' ? record.amount : null,
      unit: this.asString(record.unitText) || this.asString(record.unit),
      notes: this.asString(record.comment),
    };
  }

  private static normalizeInstructions(value: unknown): string[] {
    if (!value) {
      return [];
    }

    if (typeof value === 'string') {
      return value
        .split(/\n+/)
        .map((step) => step.trim())
        .filter(Boolean);
    }

    if (Array.isArray(value)) {
      return value.flatMap((item) => this.normalizeInstructions(item));
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (Array.isArray(record.itemListElement)) {
        return this.normalizeInstructions(record.itemListElement);
      }

      const text = this.asString(record.text) || this.asString(record.name);
      return text ? [text] : [];
    }

    return [];
  }

  static async saveRecipe(householdId: string, recipe: ParsedRecipe & { sourceUrl?: string | null; imageUrl?: string | null }): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Generate embedding
      const embeddingText = EmbeddingService.prepareRecipeText({
        title: recipe.title,
        ingredients: recipe.ingredients.map(i => i.name),
        instructions: recipe.instructions.join('\n')
      });
      const embedding = await EmbeddingService.generate(embeddingText);

      const recipeResult = await client.query(
        `INSERT INTO recipes (
          household_id, source_url, image_url, title, description, instructions, servings, prep_time_minutes, cook_time_minutes,
          calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving, embedding
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [
          householdId,
          recipe.sourceUrl,
          recipe.imageUrl ?? null,
          recipe.title,
          recipe.description,
          recipe.instructions.join('\n'),
          recipe.servings,
          recipe.prepTimeMinutes,
          recipe.cookTimeMinutes,
          recipe.caloriesPerServing ?? null,
          recipe.proteinPerServing ?? null,
          recipe.carbsPerServing ?? null,
          recipe.fatPerServing ?? null,
          JSON.stringify(embedding)
        ]
      );

      const savedRecipe = recipeResult.rows[0];

      for (const ing of recipe.ingredients) {
        await client.query(
          `INSERT INTO recipe_ingredients (
            recipe_id, name, original_text, quantity, unit, notes
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            savedRecipe.id,
            ing.name,
            ing.originalText,
            ing.quantity,
            ing.unit,
            ing.notes
          ]
        );
      }

      await client.query('COMMIT');

      const ingredientsResult = await client.query(
        'SELECT * FROM recipe_ingredients WHERE recipe_id = $1',
        [savedRecipe.id]
      );
      
      return {
        ...savedRecipe,
        ingredients: ingredientsResult.rows
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async addIngredientsToShoppingList(
    userId: string,
    listId: string,
    ingredientIds: string[]
  ): Promise<any[]> {
    const added = [];
    for (const id of ingredientIds) {
      const { rows: ingredientRows } = await pool.query(
        'SELECT * FROM recipe_ingredients WHERE id = $1',
        [id]
      );

      if (ingredientRows.length > 0) {
        const ing = ingredientRows[0];
        const { rows: itemRows } = await pool.query(
          `INSERT INTO list_items (list_id, name, quantity, unit, added_by_user_id, notes)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [listId, ing.name, ing.quantity, ing.unit, userId, ing.notes]
        );
        added.push(itemRows[0]);
      }
    }
    return added;
  }

  static async deleteRecipe(householdId: string, recipeId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [recipeId]);
      await client.query('DELETE FROM recipes WHERE id = $1 AND household_id = $2', [recipeId, householdId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async updateRecipe(householdId: string, recipeId: string, recipe: ParsedRecipe & { imageUrl?: string | null }): Promise<any> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Generate embedding
      const embeddingText = EmbeddingService.prepareRecipeText({
        title: recipe.title,
        ingredients: recipe.ingredients.map(i => i.name),
        instructions: recipe.instructions.join('\n')
      });
      const embedding = await EmbeddingService.generate(embeddingText);

      const recipeResult = await client.query(
        `UPDATE recipes SET
          title = $1, description = $2, instructions = $3, servings = $4, prep_time_minutes = $5, cook_time_minutes = $6,
          calories_per_serving = $7, protein_per_serving = $8, carbs_per_serving = $9, fat_per_serving = $10,
          image_url = $11, updated_at = NOW(), embedding = $12
        WHERE id = $13 AND household_id = $14 RETURNING *`,
        [
          recipe.title,
          recipe.description,
          recipe.instructions.join('\n'),
          recipe.servings,
          recipe.prepTimeMinutes,
          recipe.cookTimeMinutes,
          recipe.caloriesPerServing ?? null,
          recipe.proteinPerServing ?? null,
          recipe.carbsPerServing ?? null,
          recipe.fatPerServing ?? null,
          recipe.imageUrl ?? null,
          JSON.stringify(embedding),
          recipeId,
          householdId
        ]
      );

      if (recipeResult.rows.length === 0) {
          throw new Error('Recipe not found or you do not have permission to edit it');
      }

      const updatedRecipe = recipeResult.rows[0];

      // Replace ingredients
      await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [recipeId]);
      for (const ing of recipe.ingredients) {
        await client.query(
          `INSERT INTO recipe_ingredients (
            recipe_id, name, original_text, quantity, unit, notes
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            recipeId,
            ing.name,
            ing.originalText,
            ing.quantity,
            ing.unit,
            ing.notes
          ]
        );
      }

      await client.query('COMMIT');

      const ingredientsResult = await client.query(
        'SELECT * FROM recipe_ingredients WHERE recipe_id = $1',
        [recipeId]
      );
      
      return {
        ...updatedRecipe,
        ingredients: ingredientsResult.rows
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async createEnrichedRecipe(
    householdId: string,
    basicData: { title: string; ingredients: string[]; instructions: string; imageUrl?: string | null }
  ): Promise<any> {
    const enriched = await OpenRouterService.enrichRecipe(basicData.title, basicData.ingredients, basicData.instructions);
    
    try {
      const macros = await OpenRouterService.calculateMacros(
        enriched.title,
        enriched.ingredients.map(i => i.originalText || i.name),
        enriched.servings || 1
      );
      Object.assign(enriched, macros);
    } catch {
      // Macro enrichment is opportunistic and should not fail recipe creation.
    }

    return await this.saveRecipe(householdId, {
      ...enriched,
      imageUrl: basicData.imageUrl ?? null,
    });
  }
}

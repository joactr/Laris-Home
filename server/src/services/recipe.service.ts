import pool from '../db/pool';
import { OpenRouterService, ParsedRecipe } from './openrouter.service';
import { EmbeddingService } from './embedding.service';

export class RecipeService {
  static async fetchAndParse(url: string): Promise<ParsedRecipe> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const html = await response.text();
    
    let textContent = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (textContent.length > 10000) {
      textContent = textContent.substring(0, 10000) + '...';
    }

    const recipe = await OpenRouterService.parseRecipe(textContent);

    try {
      const macros = await OpenRouterService.calculateMacros(
        recipe.title,
        recipe.ingredients.map(i => i.originalText || i.name),
        recipe.servings || 1
      );
      Object.assign(recipe, macros);
    } catch (e) {
      console.error('Failed to calculate macros:', e);
    }

    return recipe;
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
    } catch (e) {
      console.error('Failed to calculate macros:', e);
    }

    return await this.saveRecipe(householdId, {
      ...enriched,
      imageUrl: basicData.imageUrl ?? null,
    });
  }
}

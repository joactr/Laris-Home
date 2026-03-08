import pool from './src/db/pool';
import { EmbeddingService } from './src/services/embedding.service';

async function backfill() {
  const client = await pool.connect();
  try {
    console.log('Fetching recipes without embeddings...');
    const { rows: recipes } = await client.query(
      `SELECT r.id, r.title, r.instructions, 
              array_agg(ri.name) as ingredients
       FROM recipes r
       LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
       WHERE r.embedding IS NULL
       GROUP BY r.id`
    );

    console.log(`Found ${recipes.length} recipes to process.`);

    for (const recipe of recipes) {
      console.log(`Processing: ${recipe.title}`);
      const text = EmbeddingService.prepareRecipeText({
        title: recipe.title,
        ingredients: recipe.ingredients || [],
        instructions: recipe.instructions || ''
      });
      
      const embedding = await EmbeddingService.generate(text);
      
      await client.query(
        'UPDATE recipes SET embedding = $1 WHERE id = $2',
        [JSON.stringify(embedding), recipe.id]
      );
    }

    console.log('Backfill complete!');
  } catch (err) {
    console.error('Backfill failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

backfill();

import pool from '../db/pool';
import {
  parsedRecipeSchema,
  recipeCommandResultSchema,
  voiceRecipesResultSchema,
  voiceShoppingResultSchema,
} from '../contracts/voice';

export interface ParsedIngredient {
  name: string;
  originalText: string;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
}

export interface ParsedRecipe {
  title: string;
  description: string;
  servings?: number | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  caloriesPerServing?: number | null;
  proteinPerServing?: number | null;
  carbsPerServing?: number | null;
  fatPerServing?: number | null;
  ingredients: ParsedIngredient[];
  instructions: string[];
}

export interface VoiceShoppingItem {
  name: string;
  quantity: number;
}

export interface VoiceShoppingResult {
  items: VoiceShoppingItem[];
  message: string;
}

export interface RecipeSuggestion {
  id?: string;
  name: string;
  ingredients: string[];
  instructions: string;
  time: string;
  image: string;
}

export interface VoiceRecipesResult {
  recipes: RecipeSuggestion[];
  message: string;
}

export interface RecipeCommandResult {
  message: string;
  modifiedRecipe?: ParsedRecipe | null;
}

export interface DailySummaryInput {
  dateLabel: string;
  events: Array<{ title: string; time: string; assignedTo?: string | null }>;
  chores: Array<{ title: string; status: string; assignedTo?: string | null }>;
  meals: string[];
  mealDetails: Array<{ mealType: string; value: string }>;
  overdueTasks: Array<{ title: string; project: string }>;
  shoppingPendingCount: number;
  shoppingItems: Array<{ name: string; listName?: string | null; quantity?: number | null; unit?: string | null }>;
  attentionItems: Array<{ title: string; hint: string }>;
}

const OPENROUTER_API_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo';

function extractJsonObject(resultText: string) {
  const startIndex = resultText.indexOf('{');
  const endIndex = resultText.lastIndexOf('}');
  if (startIndex === -1 || endIndex === -1) {
    throw new Error('No JSON object found in response');
  }
  return resultText.substring(startIndex, endIndex + 1);
}

function parseStructuredResponse<T>(
  resultText: string,
  context: string,
  parser: (value: unknown) => T
) {
  try {
    return parser(JSON.parse(extractJsonObject(resultText)));
  } catch (_error) {
    console.error(`Failed to parse LLM response for ${context}`);
    throw new Error('Invalid JSON response from LLM');
  }
}

export class OpenRouterService {
  static isConfigured() {
    return Boolean(OPENROUTER_API_KEY);
  }

  static async parseRecipe(content: string): Promise<ParsedRecipe> {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const systemMessage = `You are an assistant specialized in extracting structured cooking recipes from messy web page content (HTML or text).
Keep the ORIGINAL language of the source content for all recipe fields: title, description, ingredients, notes and instructions. Do NOT translate the recipe to another language.
Ingredient names may be in any language; keep each ingredient name in its original language while still parsing quantity and unit correctly.
Ignore and remove any editorial or commercial noise that is not part of the recipe: texts like "affiliate link", "sponsored", ads, purchase recommendations, product links, app notes, user comments or promotional content.
Decode HTML entities before responding (for example, &#x27; should be a normal apostrophe) and do not include escaped HTML symbols in any field.
Return ONLY a valid JSON object following exactly this schema:

{
  "title": "string",
  "description": "string",
  "servings": 2,
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 30,
  "ingredients": [
    {
      "name": "string",
      "originalText": "string",
      "quantity": 1,
      "unit": "string",
      "notes": "string"
    }
  ],
  "instructions": [
    "string"
  ]
}
If any data is missing (for example, times or servings), use null or a reasonable value, but never change the structure.
Do not add comments, explanations or text outside the JSON.`;

    const userMessage = `Below is the content extracted from a recipe page.
Extract the recipe following the JSON schema given in the system message.
Keep everything in the original language of the content (title, description, ingredients, instructions); do not translate.

Page content:
${content}`;

    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://laris-home.local',
        'X-Title': 'Laris Home'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const resultText = data.choices?.[0]?.message?.content ?? '';

    return parseStructuredResponse(
      resultText,
      'recipe extraction',
      (value) => parsedRecipeSchema.parse(value) as ParsedRecipe
    );
  }

  static async parseVoiceShopping(transcript: string): Promise<VoiceShoppingResult> {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const systemMessage = `You are a shopping assistant. Analyze this user transcript and return ONLY valid JSON:
User said: "${transcript}"

Extract:
- Mentioned products (synonyms OK: "apples" and "apple" are the same product), keeping the product name in the user's original wording/language.
- Quantities (explicit or implicit: "a few" = 2-3)
- If no quantity is mentioned, use 1
- Write the "message" field in English.

EXACT format:
{
  "items": [
    {"name": "product_name", "quantity": 2}
  ],
  "message": "Summary for user"
}

Examples:
"I want 2 kilos of apples and 1 liter of milk" -> items: [{"name":"apples","quantity":2},{"name":"milk","quantity":1}]
"add bread" -> items: [{"name":"bread","quantity":1}]`;

    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://laris-home.local',
        'X-Title': 'Laris Home'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: transcript }
        ]
      })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const resultText = data.choices?.[0]?.message?.content ?? '';

    return parseStructuredResponse(
      resultText,
      'voice shopping',
      (value) => voiceShoppingResultSchema.parse(value) as VoiceShoppingResult
    );
  }

  static async parseVoiceRecipes(
    transcript: string, 
    existingRecipes: { id: string, title: string, ingredients: string[], instructions?: string }[] = [],
    suggestionLimit: number = 3
  ): Promise<VoiceRecipesResult> {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const recipesContext = existingRecipes.map(r =>
      `ID: ${r.id} | Title: ${r.title} | Ingredients: ${r.ingredients.join(', ')}${r.instructions ? ` | Instructions: ${r.instructions.substring(0, 100)}...` : ''}`
    ).join('\n');

    const systemMessage = `You are a recipes expert with semantic search skills. Analyze the user request: "${transcript}"

My saved recipes (Context):
${recipesContext || 'No saved recipes yet.'}

Semantic search instructions:
1. Carefully analyze the ingredients and the type of dish requested by the user.
2. Compare this with my saved recipes. Look for semantic matches (e.g. if they ask for "pasta with something from the sea" and I have "Spaghetti Frutti di Mare", that is a match).
3. If you find a recipe that fits perfectly or very well, you MUST put it as the first option using EXACTLY the name as it appears in my list (Context); never translate saved recipe names.
4. Do not limit yourself to exact names only; analyze whether the ingredients the user mentions are present in any saved recipe.
5. Always suggest ${suggestionLimit} new creative recipes based on what the user asks for, IN ADDITION to the matching saved recipes.
6. Write all newly generated text (new recipe names, ingredients, instructions, and the "message" field) in English. Keep saved recipe names exactly as they are.

Return ONLY JSON:
{
  "recipes": [
    {
      "name": "Recipe name (USE THE EXACT NAME IF IT EXISTS IN MY LIST)",
      "ingredients": ["ing1", "ing2"],
      "instructions": "Step 1. Step 2.",
      "time": "15 min",
      "image": "image_url"
    }
  ],
  "message": "Personalized message"
}`;

    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://laris-home.local',
        'X-Title': 'Laris Home'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: transcript }
        ]
      })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const resultText = data.choices?.[0]?.message?.content ?? '';

    return parseStructuredResponse(
      resultText,
      'voice recipes',
      (value) => voiceRecipesResultSchema.parse(value) as VoiceRecipesResult
    );
  }

  static async enrichRecipe(title: string, ingredients: string[], instructions: string): Promise<ParsedRecipe> {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const systemMessage = `You are an expert chef. Your task is to take a basic recipe (title, simple ingredient list and brief instructions) and return a detailed, professional version.
You must:
1. Keep the title (in its original language).
2. Expand the description to make it appealing.
3. Realistically estimate servings, prep time and cook time.
4. Structure the ingredients with logical quantities and units (e.g. "2 units", "100 g", "1 tablespoon").
5. Detail the instructions step by step, clearly.

Write all generated text (description, ingredient names, instructions) in English, keeping the same JSON structure, and follow strictly this JSON format:

{
  "title": "string",
  "description": "string",
  "servings": 2,
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 30,
  "ingredients": [
    {
      "name": "ingredient name",
      "originalText": "quantity and unit + name",
      "quantity": 1,
      "unit": "unit",
      "notes": "optional notes"
    }
  ],
  "instructions": [
    "Step 1...",
    "Step 2..."
  ]
}

Do not add any text before or after the JSON.`;

    const userMessage = `Basic recipe:
Title: ${title}
Ingredients: ${ingredients.join(', ')}
Instructions: ${instructions}`;

    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://laris-home.local',
        'X-Title': 'Laris Home'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const resultText = data.choices?.[0]?.message?.content ?? '';

    return parseStructuredResponse(
      resultText,
      'recipe enrichment',
      (value) => parsedRecipeSchema.parse(value) as ParsedRecipe
    );
  }

  static async calculateMacros(title: string, ingredients: string[], servings: number): Promise<{ caloriesPerServing: number | null, proteinPerServing: number | null, carbsPerServing: number | null, fatPerServing: number | null }> {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const systemMessage = `You are an expert and precise nutritionist. Your only task is to calculate the accurate nutritional values per serving of a recipe.
To improve precision and avoid hallucinations, base yourself strictly on the provided ingredients, their quantities and the number of servings.
Calculate the total values for the whole recipe and then divide them exactly by the indicated number of servings.

Consider:
- Caloric density of each ingredient (e.g. olive oil = 9 kcal/g, chicken breast = 165 kcal/100g).
- Standard quantities when measures like "cup", "tablespoon", etc. are used.
- Assume average sizes for single units (e.g. 1 medium apple = 180g).
- Ingredient names may be in any language; interpret them by meaning.

Return ONLY a valid JSON object with this format:
{
  "caloriesPerServing": number,
  "proteinPerServing": number,
  "carbsPerServing": number,
  "fatPerServing": number
}
If it is impossible to determine the macros with reasonable precision, use null values.
Do not include absolutely any explanation or additional text besides the JSON.`;

    const userMessage = `Please calculate the macros for 1 serving based on this data:
Recipe: ${title}
Total servings in the recipe: ${servings}
Total ingredients:
${ingredients.join('\\n')}

Generate the JSON with the exact value for 1 serving.`;

    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://laris-home.local',
        'X-Title': 'Laris Home'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.1 // Low temperature for more deterministic and precise responses.
      })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const resultText = data.choices?.[0]?.message?.content ?? '';

    try {
      return parseStructuredResponse(
        resultText,
        'recipe macros',
        (value) => value as { caloriesPerServing: number | null, proteinPerServing: number | null, carbsPerServing: number | null, fatPerServing: number | null }
      );
    } catch (_e) {
      return { caloriesPerServing: null, proteinPerServing: null, carbsPerServing: null, fatPerServing: null };
    }
  }

  static async processRecipeCommand(
    transcript: string,
    recipe: { title: string, ingredients: string[], instructions: string }
  ): Promise<RecipeCommandResult> {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const systemMessage = `You are an expert cooking assistant. You are helping the user with a specific recipe.
The user may ask questions about the recipe or request modifications (substitute ingredients, remove something, change servings, etc.).

Current recipe:
Title: ${recipe.title}
Ingredients: ${recipe.ingredients.join(', ')}
Instructions: ${recipe.instructions}

Behavior instructions:
1. If the user asks a question or requests advice (e.g. "do you think it would be better with more butter?"), ANSWER in a friendly, expert way in the "message" field. Do NOT generate a "modifiedRecipe" unless the user explicitly says to change it (e.g. "Add more butter then", "Swap the chicken for turkey").
2. If the user requests an explicit change, generate the new full version of the recipe in the "modifiedRecipe" field and briefly explain what you changed in the "message" field.
3. The modified version must follow the ParsedRecipe schema and keep the original language of the recipe.
4. Always write the "message" field in English.

Return ONLY JSON with this format:
{
  "message": "Reply to the user or explanation of the change",
  "modifiedRecipe": {
    "title": "string",
    "description": "string",
    "servings": 2,
    "prepTimeMinutes": 15,
    "cookTimeMinutes": 30,
    "ingredients": [
      {
        "name": "name",
        "originalText": "quantity unit name",
        "quantity": 1,
        "unit": "unit",
        "notes": "string"
      }
    ],
    "instructions": ["step 1", "step 2"]
  }
}
If no explicit change is requested, "modifiedRecipe" MUST be null.`;

    const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://laris-home.local',
        'X-Title': 'Laris Home'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: transcript }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const resultText = data.choices?.[0]?.message?.content ?? '';

    return parseStructuredResponse(
      resultText,
      'recipe command',
      (value) => recipeCommandResultSchema.parse(value) as RecipeCommandResult
    );
  }

  static async generateDailySummary(input: DailySummaryInput): Promise<string> {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const systemMessage = `You are a home assistant summarizing the day of a shared household.
Write in natural, concrete, useful and actionable English.
Rules:
- 3 or 4 sentences maximum.
- Give real details: concrete titles, times, meals or items when they exist.
- Prioritize first what needs attention today.
- If there are events, cite at least the most important one with its time.
- If there is pending shopping, mention examples of concrete items, not just the total count.
- If there are planned meals, say which ones.
- If something is empty, do not mention it.
- Do not use marketing tone.
- Do not invent data.
Return only plain text.`;

    const userMessage = `Summarize this household day:
Date: ${input.dateLabel}
Events: ${input.events.length ? input.events.map((e) => `${e.time} ${e.title}${e.assignedTo ? ` (${e.assignedTo})` : ''}`).join('; ') : 'none'}
Household chores: ${input.chores.length ? input.chores.map((c) => `${c.title} [${c.status}]${c.assignedTo ? ` (${c.assignedTo})` : ''}`).join('; ') : 'none'}
Planned meals: ${input.mealDetails.length ? input.mealDetails.map((m) => `${m.mealType}: ${m.value}`).join('; ') : 'none'}
Overdue project tasks: ${input.overdueTasks.length ? input.overdueTasks.map((t) => `${t.title} (${t.project})`).join('; ') : 'none'}
Pending shopping items: ${input.shoppingPendingCount}
Pending shopping examples: ${input.shoppingItems.length ? input.shoppingItems.map((item) => `${item.name}${item.quantity ? ` (${item.quantity}${item.unit ? ` ${item.unit}` : ''})` : ''}${item.listName ? ` in ${item.listName}` : ''}`).join('; ') : 'none'}
Items needing attention: ${input.attentionItems.length ? input.attentionItems.map((item) => `${item.title}: ${item.hint}`).join('; ') : 'none'}
`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://laris-home.local',
          'X-Title': 'Laris Home'
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.2
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return String(data.choices?.[0]?.message?.content || '').trim();
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error('OpenRouter summary timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

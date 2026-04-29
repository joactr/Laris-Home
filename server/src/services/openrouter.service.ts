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

    const systemMessage = `Eres un asistente especializado en extraer recetas de cocina estructuradas a partir de contenido desordenado de páginas web (HTML o texto).
Siempre debes devolver toda la información en español: título, descripción, ingredientes, notas e instrucciones.
Normaliza los nombres de los ingredientes a español natural (por ejemplo, “cebolla”, “ajo”, “aceite de oliva”, “pechuga de pollo”).
Devuelve ÚNICAMENTE un objeto JSON válido que siga exactamente este esquema:

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
Si falta algún dato (por ejemplo, tiempos o raciones), pon null o un valor razonable, pero nunca cambies la estructura.
No añadas comentarios, explicaciones ni texto fuera del JSON.`;

    const userMessage = `A continuación tienes el contenido extraído de una página de receta.
Extrae la receta siguiendo el esquema JSON indicado en el mensaje del sistema.
Traduce y/o normaliza todo al español (título, descripción, ingredientes, instrucciones).
Si el contenido original está en otro idioma, interpreta el significado pero escribe el resultado final en español.

Contenido de la página:
${content}`;

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
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    let resultText = data.choices[0].message.content;

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

    const systemMessage = `Eres un asistente de compras. Analiza esta transcripción del usuario y devuelve SOLO JSON válido:
Usuario dijo: "${transcript}"

Extrae:
- Productos mencionados (sinónimos OK: manzana=apple, etc.)
- Cantidades (explícitas o implícitas: "unas" = 2-3)
- Si no menciona cantidad, usa 1

Formato EXACTO:
{
  "items": [
    {"name": "nombre_producto", "quantity": 2}
  ],
  "message": "Resumen para usuario"
}

Ejemplos:
"Quiero 2 kilos de manzanas y 1 litro de leche" -> items: [{"name":"manzanas","quantity":2},{"name":"leche","quantity":1}]
"añade pan" -> items: [{"name":"pan","quantity":1}]`;

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
          { role: 'user', content: transcript }
        ]
      })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    let resultText = data.choices[0].message.content;

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
      `ID: ${r.id} | Título: ${r.title} | Ingredientes: ${r.ingredients.join(', ')}${r.instructions ? ` | Instrucciones: ${r.instructions.substring(0, 100)}...` : ''}`
    ).join('\n');

    const systemMessage = `Eres experto en recetas y búsqueda semántica. Analiza la petición del usuario: "${transcript}"

Mis recetas guardadas (Contexto):
${recipesContext || 'No hay recetas guardadas aún.'}

Instrucciones de búsqueda semántica:
1. Analiza cuidadosamente los ingredientes y el tipo de plato solicitado por el usuario.
2. Compara esto con mis recetas guardadas. Busca coincidencias semánticas (ej: si pide "pasta con algo de mar" y tengo "Espaguetis Frutti di Mare", es una coincidencia).
3. Si encuentras una receta que encaja perfectamente o muy bien, DEBES ponerla como primera opción usando EXACTAMENTE el nombre que aparece en mi lista (Contexto).
4. No te limites solo a nombres exactos; analiza si los ingredientes que el usuario menciona están presentes en alguna receta guardada.
5. Siempre sugiere ${suggestionLimit} recetas nuevas y creativas basadas en lo que pide el usuario, ADEMÁS de las recetas guardadas que coincidan.

Devuelve SOLO JSON:
{
  "recipes": [
    {
      "name": "Nombre de la receta (USA EL NOMBRE EXACTO SI EXISTE EN MI LISTA)",
      "ingredients": ["ing1", "ing2"],
      "instructions": "Paso 1. Paso 2.",
      "time": "15 min",
      "image": "url_imagen"
    }
  ],
  "message": "Mensaje personalizado"
}`;

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
          { role: 'user', content: transcript }
        ]
      })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    let resultText = data.choices[0].message.content;

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

    const systemMessage = `Eres un experto chef. Tu tarea es recibir una receta básica (título, lista simple de ingredientes e instrucciones breves) y devolver una versión detallada y profesional.
Debes:
1. Mantener el título.
2. Expandir la descripción para que sea atractiva.
3. Estimar de forma realista para cuántas personas es (servings), tiempo de preparación y cocción.
4. Estructurar los ingredientes con cantidades y unidades lógicas (ej: "2 unidades", "100 g", "1 cucharada").
5. Detallar las instrucciones paso a paso de forma clara.

Toda la respuesta debe estar en español y seguir estrictamente este formato JSON:

{
  "title": "string",
  "description": "string",
  "servings": 2,
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 30,
  "ingredients": [
    {
      "name": "nombre del ingrediente",
      "originalText": "cantidad y unidad + nombre",
      "quantity": 1,
      "unit": "unidad",
      "notes": "notas opcionales"
    }
  ],
  "instructions": [
    "Paso 1...",
    "Paso 2..."
  ]
}

No añadas ningún texto antes ni después del JSON.`;

    const userMessage = `Receta básica:
Título: ${title}
Ingredientes: ${ingredients.join(', ')}
Instrucciones: ${instructions}`;

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
        ]
      })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    let resultText = data.choices[0].message.content;

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

    const systemMessage = `Eres un nutricionista experto y preciso. Tu única tarea es calcular los valores nutricionales precisos por cada ración (serving) de una receta.
Para mejorar la precisión y evitar alucinaciones, debes basarte estrictamente en los ingredientes proporcionados, sus cantidades y el número de raciones.
Calcula los valores totales de la receta completa y luego divídelos exactamente por el número de raciones indicadas.

Considera:
- Densidad calórica de cada ingrediente (ej. aceite de oliva = 9 kcal/g, pechuga de pollo = 165 kcal/100g).
- Cantidades estándar si se usan medidas como "taza", "cucharada", etc.
- Asume tamaños promedio para unidades sueltas (ej. 1 manzana mediana = 180g).

Devuelve ÚNICAMENTE un objeto JSON válido con este formato:
{
  "caloriesPerServing": numero,
  "proteinPerServing": numero,
  "carbsPerServing": numero,
  "fatPerServing": numero
}
Si es imposible determinar las macros con cierta precisión, usa valores nulos (null).
No incluyas absolutamente ninguna explicación ni texto adicional al JSON.`;

    const userMessage = `Por favor calcula las macros para 1 ración basada en estos datos:
Receta: ${title}
Raciones totales de la receta: ${servings}
Ingredientes totales:
${ingredients.join('\\n')}

Genera el JSON con el valor exacto por 1 ración.`;

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
        temperature: 0.1 // Baja temperatura para respuestas más deterministas y precisas.
      })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    let resultText = data.choices[0].message.content;

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

    const systemMessage = `Eres un asistente de cocina experto. Estás ayudando al usuario con una receta específica.
El usuario puede hacer preguntas sobre la receta o pedir modificaciones (sustituir ingredientes, quitar algo, cambiar porciones, etc.).

Receta actual:
Título: ${recipe.title}
Ingredientes: ${recipe.ingredients.join(', ')}
Instrucciones: ${recipe.instructions}

Instrucciones de comportamiento:
1. Si el usuario hace una pregunta o pide consejo (ej: "¿crees que quedaría mejor con más mantequilla?"), RESPONDE de forma amable y experta en el campo "message". NO generes un "modifiedRecipe" a menos que el usuario diga explícitamente que lo cambies (ej: "Añade más mantequilla entonces", "Cambia el pollo por pavo").
2. Si el usuario pide un cambio explícito, genera la nueva versión de la receta completa en el campo "modifiedRecipe" y explica brevemente qué has cambiado en el campo "message".
3. La versión modificada debe seguir el esquema ParsedRecipe.
4. Siempre responde en español.

Devuelve SOLO JSON con este formato:
{
  "message": "Respuesta al usuario o explicación del cambio",
  "modifiedRecipe": {
    "title": "string",
    "description": "string",
    "servings": 2,
    "prepTimeMinutes": 15,
    "cookTimeMinutes": 30,
    "ingredients": [
      {
        "name": "nombre",
        "originalText": "cantidad unidad nombre",
        "quantity": 1,
        "unit": "unidad",
        "notes": "string"
      }
    ],
    "instructions": ["paso 1", "paso 2"]
  }
}
Si no hay cambio explícito solicitado, "modifiedRecipe" DEBE ser null.`;

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
          { role: 'user', content: transcript }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as any;
    let resultText = data.choices[0].message.content;

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

    const systemMessage = `Eres un asistente doméstico que resume el día de una casa compartida.
Escribe en español natural, concreto, útil y accionable.
Reglas:
- 3 o 4 frases como máximo.
- Da detalles reales: títulos, horas, comidas o artículos concretos cuando existan.
- Prioriza primero lo que requiere atención hoy.
- Si hay eventos, cita al menos el más importante con su hora.
- Si hay compra pendiente, menciona ejemplos de artículos concretos, no solo el número total.
- Si hay comidas planificadas, di cuáles.
- Si algo está vacío, no lo menciones.
- No uses tono marketiniano.
- No inventes datos.
Devuelve solo texto plano.`;

    const userMessage = `Resume esta jornada doméstica:
Fecha: ${input.dateLabel}
Eventos: ${input.events.length ? input.events.map((e) => `${e.time} ${e.title}${e.assignedTo ? ` (${e.assignedTo})` : ''}`).join('; ') : 'ninguno'}
Tareas del hogar: ${input.chores.length ? input.chores.map((c) => `${c.title} [${c.status}]${c.assignedTo ? ` (${c.assignedTo})` : ''}`).join('; ') : 'ninguna'}
Comidas previstas: ${input.mealDetails.length ? input.mealDetails.map((m) => `${m.mealType}: ${m.value}`).join('; ') : 'ninguna'}
Tareas atrasadas de proyectos: ${input.overdueTasks.length ? input.overdueTasks.map((t) => `${t.title} (${t.project})`).join('; ') : 'ninguna'}
Artículos pendientes en compra: ${input.shoppingPendingCount}
Ejemplos de compra pendiente: ${input.shoppingItems.length ? input.shoppingItems.map((item) => `${item.name}${item.quantity ? ` (${item.quantity}${item.unit ? ` ${item.unit}` : ''})` : ''}${item.listName ? ` en ${item.listName}` : ''}`).join('; ') : 'ninguno'}
Puntos que requieren atención: ${input.attentionItems.length ? input.attentionItems.map((item) => `${item.title}: ${item.hint}`).join('; ') : 'ninguno'}
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

      const data = await response.json() as any;
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

import pool from '../db/pool';

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

const OPENROUTER_API_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo';

export class OpenRouterService {
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
  "caloriesPerServing": 350,
  "proteinPerServing": 20,
  "carbsPerServing": 30,
  "fatPerServing": 15,
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

    try {
      const startIndex = resultText.indexOf('{');
      const endIndex = resultText.lastIndexOf('}');
      if (startIndex === -1 || endIndex === -1) {
        throw new Error('No JSON object found in response');
      }
      const jsonStr = resultText.substring(startIndex, endIndex + 1);
      return JSON.parse(jsonStr) as ParsedRecipe;
    } catch (e) {
      console.error('Failed to parse LLM response as JSON. Response:', resultText);
      throw new Error('Invalid JSON response from LLM');
    }
  }

  static async parseVoiceShopping(transcript: string): Promise<VoiceShoppingResult> {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const systemMessage = `Eres un asistente de compras. Analiza esta transcripción del usuario y devuelve SOLO JSON válido:
Usuario dijo: "\${transcript}"

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

    try {
      const startIndex = resultText.indexOf('{');
      const endIndex = resultText.lastIndexOf('}');
      if (startIndex === -1 || endIndex === -1) {
        throw new Error('No JSON object found in response');
      }
      const jsonStr = resultText.substring(startIndex, endIndex + 1);
      return JSON.parse(jsonStr) as VoiceShoppingResult;
    } catch (e) {
      console.error('Failed to parse LLM response as JSON. Response:', resultText);
      throw new Error('Invalid JSON response from LLM');
    }
  }

  static async parseVoiceRecipes(transcript: string): Promise<VoiceRecipesResult> {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const systemMessage = `Eres experto en recetas. Analiza: "\${transcript}"

Casos:
- "Me apetece receta con X, Y, Z" -> Sugiere 3 recetas con esos ingredientes
- "Tengo pollo, arroz, cebolla" -> 3 recetas con TODOS esos ingredientes
- "Receta rápida vegetariana" -> 3 opciones fitting

Devuelve SOLO JSON:
{
  "recipes": [
    {
      "name": "Nombre atractivo",
      "ingredients": ["ing1", "ing2"],
      "instructions": "Paso 1. Paso 2.",
      "time": "15 min",
      "image": "url_imagen"
    }
  ],
  "message": "¡Aquí tienes opciones perfectas!"
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

    try {
      const startIndex = resultText.indexOf('{');
      const endIndex = resultText.lastIndexOf('}');
      if (startIndex === -1 || endIndex === -1) {
        throw new Error('No JSON object found in response');
      }
      const jsonStr = resultText.substring(startIndex, endIndex + 1);
      return JSON.parse(jsonStr) as VoiceRecipesResult;
    } catch (e) {
      console.error('Failed to parse LLM response as JSON. Response:', resultText);
      throw new Error('Invalid JSON response from LLM');
    }
  }
}

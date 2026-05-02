import pool from '../db/pool';

export type ShoppingItemInput = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  notes?: string | null;
};

export type NormalizedShoppingItem = {
  name: string;
  normalized_name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  notes: string | null;
};

const UNIT_ALIASES: Record<string, { unit: string; factor: number }> = {
  kg: { unit: 'g', factor: 1000 },
  kilo: { unit: 'g', factor: 1000 },
  kilos: { unit: 'g', factor: 1000 },
  g: { unit: 'g', factor: 1 },
  gr: { unit: 'g', factor: 1 },
  gram: { unit: 'g', factor: 1 },
  grams: { unit: 'g', factor: 1 },
  l: { unit: 'ml', factor: 1000 },
  litro: { unit: 'ml', factor: 1000 },
  litros: { unit: 'ml', factor: 1000 },
  ml: { unit: 'ml', factor: 1 },
  pack: { unit: 'pack', factor: 1 },
  packs: { unit: 'pack', factor: 1 },
  paquete: { unit: 'pack', factor: 1 },
  paquetes: { unit: 'pack', factor: 1 },
  unidad: { unit: 'unit', factor: 1 },
  unidades: { unit: 'unit', factor: 1 },
  ud: { unit: 'unit', factor: 1 },
  uds: { unit: 'unit', factor: 1 },
};

export function stripAccents(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeShoppingName(value: string) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeShoppingInput(input: ShoppingItemInput): NormalizedShoppingItem {
  let name = input.name.trim().replace(/\s+/g, ' ');
  let quantity = input.quantity ?? null;
  let unit = input.unit?.trim() || null;

  const inline = name.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)?\s+(.+)$/);
  if (inline && quantity == null) {
    quantity = Number(inline[1].replace(',', '.'));
    unit = unit || inline[2] || null;
    name = inline[3].trim();
  }

  const normalizedUnit = normalizeUnit(unit);
  if (quantity != null && normalizedUnit) {
    quantity = Number((Number(quantity) * normalizedUnit.factor).toFixed(2));
    unit = normalizedUnit.unit;
  } else if (quantity != null && !unit) {
    unit = 'unit';
  }

  return {
    name,
    normalized_name: normalizeShoppingName(name),
    quantity,
    unit,
    category: input.category?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

function normalizeUnit(value: string | null | undefined) {
  if (!value) return null;
  const normalized = stripAccents(value).toLowerCase().trim();
  return UNIT_ALIASES[normalized] ?? { unit: normalized, factor: 1 };
}

export async function ensureHouseholdListAccess(listId: string, householdId: string) {
  const { rows } = await pool.query(
    'SELECT id FROM shopping_lists WHERE id = $1 AND household_id = $2',
    [listId, householdId]
  );
  return rows.length > 0;
}

export async function getHouseholdOwnedItem(itemId: string, householdId: string) {
  const { rows } = await pool.query(
    `SELECT li.*
     FROM list_items li
     JOIN shopping_lists sl ON sl.id = li.list_id
     WHERE li.id = $1 AND sl.household_id = $2`,
    [itemId, householdId]
  );
  return rows[0] ?? null;
}

export async function findActiveDuplicateCandidates(listId: string, normalizedName: string) {
  const { rows } = await pool.query(
    `SELECT *
     FROM list_items
     WHERE list_id = $1
       AND is_completed = false
       AND COALESCE(normalized_name, lower(name)) = $2
     ORDER BY created_at DESC
     LIMIT 5`,
    [listId, normalizedName]
  );
  return rows;
}

export async function insertShoppingItem(listId: string, userId: string, item: ShoppingItemInput) {
  const normalized = normalizeShoppingInput(item);
  const { rows } = await pool.query(
    `INSERT INTO list_items (list_id, name, normalized_name, quantity, unit, category, added_by_user_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [listId, normalized.name, normalized.normalized_name, normalized.quantity, normalized.unit, normalized.category, userId, normalized.notes]
  );
  return rows[0];
}

export async function mergeShoppingItem(existingItem: any, userId: string, item: ShoppingItemInput, mode: 'merge' | 'replace' | 'separate' = 'merge') {
  if (mode === 'separate') {
    return insertShoppingItem(existingItem.list_id, userId, item);
  }

  const normalized = normalizeShoppingInput(item);
  const canAddQuantities = mode === 'merge'
    && existingItem.unit
    && normalized.unit
    && existingItem.unit === normalized.unit;
  const nextQuantity = canAddQuantities
    ? Number(existingItem.quantity || 0) + Number(normalized.quantity || 0)
    : normalized.quantity ?? existingItem.quantity;

  const { rows } = await pool.query(
    `UPDATE list_items
     SET name = $1,
         normalized_name = $2,
         quantity = $3,
         unit = $4,
         category = COALESCE($5, category),
         notes = COALESCE($6, notes),
         is_completed = false,
         completed_at = null
     WHERE id = $7
     RETURNING *`,
    [
      mode === 'replace' ? normalized.name : existingItem.name,
      normalized.normalized_name,
      nextQuantity,
      normalized.unit ?? existingItem.unit,
      normalized.category,
      normalized.notes,
      existingItem.id,
    ]
  );
  return rows[0];
}

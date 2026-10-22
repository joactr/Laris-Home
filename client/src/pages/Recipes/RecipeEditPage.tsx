import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { t } from '../../i18n';
import { toastError, toastSuccess } from '../../store/toast';
import Icon from '../../components/Icon';
import type { RecipeDraft, RecipeIngredient, ShoppingList } from '../../../../shared/contracts';
import './Recipes.css';

type EditableIngredient = RecipeIngredient & { quantity: number | null; unit: string };

type EditableRecipe = {
    title: string;
    description: string;
    sourceUrl: string;
    imageUrl: string;
    servings: number | null;
    prepTimeMinutes: number | null;
    cookTimeMinutes: number | null;
    caloriesPerServing: number | null;
    proteinPerServing: number | null;
    carbsPerServing: number | null;
    fatPerServing: number | null;
    ingredients: EditableIngredient[];
    instructions: string[];
};

type RecipeApiShape = Record<string, unknown> & {
    ingredients?: Array<Record<string, unknown>>;
    instructions?: string | string[];
};

function toEditableIngredient(raw: Record<string, unknown>): EditableIngredient {
    const name = typeof raw['name'] === 'string' ? raw['name'] : '';
    const originalTextRaw = raw['originalText'] ?? raw['original_text'];
    const quantityRaw = raw['quantity'];
    const unitRaw = raw['unit'];
    const notesRaw = raw['notes'];
    return {
        name,
        originalText: typeof originalTextRaw === 'string' ? originalTextRaw : name,
        quantity: typeof quantityRaw === 'number' ? quantityRaw : null,
        unit: typeof unitRaw === 'string' ? unitRaw : '',
        notes: typeof notesRaw === 'string' ? notesRaw : null,
    };
}

function toEditable(data: RecipeApiShape): EditableRecipe {
    const pick = (camel: string, snake: string): unknown => data[camel] ?? data[snake];
    const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
    const str = (value: unknown): string => (typeof value === 'string' ? value : '');
    const instructions = data['instructions'];
    return {
        title: str(data['title']),
        description: str(data['description']),
        sourceUrl: str(pick('sourceUrl', 'source_url')),
        imageUrl: str(pick('imageUrl', 'image_url')),
        servings: num(pick('servings', 'servings')),
        prepTimeMinutes: num(pick('prepTimeMinutes', 'prep_time_minutes')),
        cookTimeMinutes: num(pick('cookTimeMinutes', 'cook_time_minutes')),
        caloriesPerServing: num(pick('caloriesPerServing', 'calories_per_serving')),
        proteinPerServing: num(pick('proteinPerServing', 'protein_per_serving')),
        carbsPerServing: num(pick('carbsPerServing', 'carbs_per_serving')),
        fatPerServing: num(pick('fatPerServing', 'fat_per_serving')),
        ingredients: (data['ingredients'] || []).map(toEditableIngredient),
        instructions: Array.isArray(instructions) ? instructions : (typeof instructions === 'string' ? instructions.split('\n') : []),
    };
}

export default function RecipeEditPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [recipe, setRecipe] = useState<EditableRecipe | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [lists, setLists] = useState<ShoppingList[]>([]);
    const [selectedListId, setSelectedListId] = useState('');
    const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
    const [isAddingToShopping, setIsAddingToShopping] = useState(false);

    useEffect(() => {
        if (!id) return;
        api.recipes.getById(id)
            .then(data => {
                setRecipe(toEditable(data as unknown as RecipeApiShape));
            })
            .catch(err => {
                setLoadError(err.message);
                toastError(t('rec.loadFail'), err.message || t('rec.tryAgain'));
            })
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        api.shopping.getLists().then(ls => {
            setLists(ls);
            setSelectedListId(current => current || ls[0]?.id || '');
        });
    }, []);

    const buildPayload = (): RecipeDraft => {
        if (!recipe) throw new Error('Sin receta');
        const toNum = (v: number | null | ''): number | null => (v === '' || v === null ? null : Number(v));
        return {
            title: recipe.title,
            description: recipe.description ?? '',
            sourceUrl: recipe.sourceUrl || '',
            imageUrl: recipe.imageUrl || '',
            servings: toNum(recipe.servings),
            prepTimeMinutes: toNum(recipe.prepTimeMinutes),
            cookTimeMinutes: toNum(recipe.cookTimeMinutes),
            caloriesPerServing: toNum(recipe.caloriesPerServing),
            proteinPerServing: toNum(recipe.proteinPerServing),
            carbsPerServing: toNum(recipe.carbsPerServing),
            fatPerServing: toNum(recipe.fatPerServing),
            ingredients: recipe.ingredients.map((ing) => ({
                name: ing.name,
                originalText: ing.originalText || ing.name,
                quantity: toNum(ing.quantity),
                unit: ing.unit || null,
                notes: ing.notes || null,
            })),
            instructions: recipe.instructions.filter((s) => s.trim() !== ''),
        };
    };

    const saveRecipe = async () => {
        if (!recipe || !id) return null;
        const updated = await api.recipes.update(id, buildPayload());
        const normalized = toEditable(updated as unknown as RecipeApiShape);
        setRecipe(normalized);
        return normalized;
    };

    const handleSave = async () => {
        if (!recipe || !id) return;
        if (!recipe.title.trim()) {
            setError(t('rec.titleRequired'));
            return;
        }
        setIsSaving(true);
        try {
            await saveRecipe();
            toastSuccess(t('rec.updated'));
            navigate(`/recipes/${id}`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('rec.saveError');
            setError(msg);
            toastError(t('rec.saveFailTitle'), msg);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleIngredientForShopping = (idx: number) => {
        const key = idx.toString();
        setSelectedIngredients(prev =>
            prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]
        );
    };

    const handleAddSelectedToShopping = async () => {
        if (!id || !selectedListId || selectedIngredients.length === 0) return;
        setIsAddingToShopping(true);
        setError(null);
        try {
            const savedRecipe = await saveRecipe();
            if (!savedRecipe) return;
            const detail = await api.recipes.getById(id);
            const all = detail.ingredients || [];
            const ingredientIds = selectedIngredients
                .map((idx) => all[parseInt(idx, 10)]?.id)
                .filter((v): v is string => typeof v === 'string');

            if (ingredientIds.length === 0) {
                throw new Error(t('rec.noValidIngredients'));
            }

            await api.recipes.addToShoppingList(id, selectedListId, ingredientIds);
            setSelectedIngredients([]);
            toastSuccess(t('rec.ingredientsAdded'), t('rec.ingredientsAddedBody'));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('rec.addShoppingError');
            setError(msg);
            toastError(t('rec.addShoppingFail'), msg);
        } finally {
            setIsAddingToShopping(false);
        }
    };

    const updateIngredient = (idx: number, field: 'name' | 'quantity' | 'unit', value: string) => {
        if (!recipe) return;
        const newIngs = recipe.ingredients.map((ing, i) =>
            i === idx
                ? field === 'quantity'
                    ? { ...ing, quantity: value === '' ? null : Number(value) }
                    : { ...ing, [field]: value }
                : ing
        );
        setRecipe({ ...recipe, ingredients: newIngs });
    };

    const deleteIngredient = (idx: number) => {
        if (!recipe) return;
        const newIngs = recipe.ingredients.filter((_, i) => i !== idx);
        setRecipe({ ...recipe, ingredients: newIngs });
    };

    const addIngredient = () => {
        if (!recipe) return;
        setRecipe({
            ...recipe,
            ingredients: [
                ...recipe.ingredients,
                { name: '', originalText: '', quantity: null, unit: '', notes: null }
            ]
        });
    };

    if (loading) return <div className="page" style={{ padding: '2rem', textAlign: 'center' }}>{t('common.loading')}</div>;
    if (loadError || !recipe) return <div className="page" style={{ padding: '2rem', color: 'red' }}>Error: {loadError || t('rec.notFound')}</div>;

    const steps = recipe.instructions;

    return (
        <div className="page">
            <div className="recipe-detail-top">
                <button className="icon-button" onClick={() => navigate(`/recipes/${id}`)} aria-label={t('common.back')}>
                    <Icon name="chevronLeft" size={20} />
                </button>
                <h1>{t('rec.editTitle')}</h1>
            </div>

            <form className="recipes-form" onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
                {error ? <div className="recipes-form-error" role="alert">{error}</div> : null}

                <section className="recipes-form-section" aria-label={t('rec.basicData')}>
                    <div className="form-group">
                        <label className="label" htmlFor="edit-title">{t('recipes.title')}</label>
                        <input
                            id="edit-title"
                            className="input"
                            value={recipe.title}
                            onChange={e => setRecipe({ ...recipe, title: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="label" htmlFor="edit-description">{t('recipes.description')}</label>
                        <textarea
                            id="edit-description"
                            className="input"
                            value={recipe.description}
                            onChange={e => setRecipe({ ...recipe, description: e.target.value })}
                        />
                    </div>

                    <div className="field-grid two">
                        <div className="form-group">
                            <label className="label" htmlFor="edit-source">{t('rec.sourceUrlOptional')}</label>
                            <input
                                id="edit-source"
                                className="input"
                                type="url"
                                placeholder="https://..."
                                value={recipe.sourceUrl}
                                onChange={e => setRecipe({ ...recipe, sourceUrl: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="label" htmlFor="edit-image">{t('rec.imageUrlOptional')}</label>
                            <input
                                id="edit-image"
                                className="input"
                                type="url"
                                placeholder="https://..."
                                value={recipe.imageUrl}
                                onChange={e => setRecipe({ ...recipe, imageUrl: e.target.value })}
                            />
                        </div>
                    </div>
                    {recipe.imageUrl ? (
                        <img
                            src={recipe.imageUrl}
                            alt={t('rec.previewAlt')}
                            className="recipes-preview"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                            onLoad={(e) => (e.currentTarget.style.display = 'block')}
                        />
                    ) : null}
                </section>

                <section className="recipes-form-section" aria-label={t('rec.servingsTimes')}>
                    <h2>{t('rec.servingsTimes')}</h2>
                    <div className="field-grid three">
                        <div className="form-group">
                            <label className="label" htmlFor="edit-servings">{t('recipes.servings')}</label>
                            <input
                                id="edit-servings"
                                type="number"
                                min={1}
                                className="input"
                                value={recipe.servings ?? ''}
                                onChange={e => setRecipe({ ...recipe, servings: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="label" htmlFor="edit-prep">{t('recipes.prepTime')}{t('rec.minSuffix')}</label>
                            <input
                                id="edit-prep"
                                type="number"
                                min={0}
                                className="input"
                                value={recipe.prepTimeMinutes ?? ''}
                                onChange={e => setRecipe({ ...recipe, prepTimeMinutes: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="label" htmlFor="edit-cook">{t('recipes.cookTime')}{t('rec.minSuffix')}</label>
                            <input
                                id="edit-cook"
                                type="number"
                                min={0}
                                className="input"
                                value={recipe.cookTimeMinutes ?? ''}
                                onChange={e => setRecipe({ ...recipe, cookTimeMinutes: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                            />
                        </div>
                    </div>
                </section>

                <section className="recipes-form-section" aria-label={t('rec.nutritionPerServing')}>
                    <h2>{t('rec.nutritionPerServing')}</h2>
                    <div className="field-grid two">
                        <div className="form-group">
                            <label className="label" htmlFor="edit-kcal">{t('recipes.calories')}</label>
                            <input
                                id="edit-kcal"
                                type="number"
                                min={0}
                                className="input"
                                value={recipe.caloriesPerServing ?? ''}
                                onChange={e => setRecipe({ ...recipe, caloriesPerServing: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="label" htmlFor="edit-protein">{t('recipes.protein')}{t('rec.gramSuffix')}</label>
                            <input
                                id="edit-protein"
                                type="number"
                                min={0}
                                className="input"
                                value={recipe.proteinPerServing ?? ''}
                                onChange={e => setRecipe({ ...recipe, proteinPerServing: e.target.value === '' ? null : parseFloat(e.target.value) })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="label" htmlFor="edit-carbs">{t('recipes.carbs')}{t('rec.gramSuffix')}</label>
                            <input
                                id="edit-carbs"
                                type="number"
                                min={0}
                                className="input"
                                value={recipe.carbsPerServing ?? ''}
                                onChange={e => setRecipe({ ...recipe, carbsPerServing: e.target.value === '' ? null : parseFloat(e.target.value) })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="label" htmlFor="edit-fat">{t('recipes.fat')}{t('rec.gramSuffix')}</label>
                            <input
                                id="edit-fat"
                                type="number"
                                min={0}
                                className="input"
                                value={recipe.fatPerServing ?? ''}
                                onChange={e => setRecipe({ ...recipe, fatPerServing: e.target.value === '' ? null : parseFloat(e.target.value) })}
                            />
                        </div>
                    </div>
                </section>

                <section className="recipes-form-section" aria-label={t('recipes.ingredients')}>
                    <div className="recipes-form-section-head">
                        <h2>{t('recipes.ingredients')}</h2>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={addIngredient}>
                            <Icon name="plus" size={16} /> {t('rec.addIngredient')}
                        </button>
                    </div>
                    <div className="recipes-ingredient-rows">
                        {recipe.ingredients.map((ing, idx) => (
                            <div key={idx} className="recipes-ingredient-row">
                                <input
                                    className="input"
                                    placeholder={t('rec.ingNamePh')}
                                    value={ing.name}
                                    aria-label={t('rec.ingredientNameAria', idx + 1)}
                                    onChange={e => updateIngredient(idx, 'name', e.target.value)}
                                />
                                <input
                                    className="input"
                                    type="number"
                                    min={0}
                                    placeholder={t('rec.ingQtyPh')}
                                    value={ing.quantity ?? ''}
                                    aria-label={t('rec.ingredientQtyAria', idx + 1)}
                                    onChange={e => updateIngredient(idx, 'quantity', e.target.value)}
                                />
                                <input
                                    className="input"
                                    placeholder={t('rec.ingUnitPh')}
                                    value={ing.unit}
                                    aria-label={t('rec.ingredientUnitAria', idx + 1)}
                                    onChange={e => updateIngredient(idx, 'unit', e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => deleteIngredient(idx)}
                                    aria-label={t('rec.removeIngredientAria', idx + 1)}
                                    title={t('rec.removeIngredient')}
                                >
                                    <Icon name="trash" size={18} />
                                </button>
                            </div>
                        ))}
                        {recipe.ingredients.length === 0 && (
                            <p className="recipe-row-meta">{t('rec.noIngredients')}</p>
                        )}
                    </div>
                </section>

                <section className="recipes-form-section" aria-label={t('recipes.instructions')}>
                    <div className="recipes-form-section-head">
                        <h2>{t('recipes.instructions')}</h2>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setRecipe({ ...recipe, instructions: [...steps, ''] })}
                        >
                            <Icon name="plus" size={16} /> {t('rec.addStep')}
                        </button>
                    </div>
                    <div className="recipes-ingredient-rows">
                        {steps.map((step, idx) => (
                            <div key={idx} className="recipes-step-row">
                                <span className="recipes-step-num" aria-hidden="true">{idx + 1}</span>
                                <textarea
                                    className="input"
                                    placeholder={t('rec.stepPh', idx + 1)}
                                    value={step}
                                    aria-label={t('rec.stepAria', idx + 1)}
                                    onChange={e => {
                                        const next = [...steps];
                                        next[idx] = e.target.value;
                                        setRecipe({ ...recipe, instructions: next });
                                    }}
                                />
                                <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => {
                                        setRecipe({ ...recipe, instructions: steps.filter((_, i) => i !== idx) });
                                    }}
                                    aria-label={t('rec.removeStepAria', idx + 1)}
                                    title={t('rec.removeStep')}
                                >
                                    <Icon name="trash" size={18} />
                                </button>
                            </div>
                        ))}
                        {steps.length === 0 && (
                            <p className="recipe-row-meta">{t('rec.noSteps')}</p>
                        )}
                    </div>
                </section>

                <section className="recipes-form-section" aria-label={t('rec.addToShopping')}>
                    <div className="recipes-form-section-head">
                        <h2>{t('rec.addToShopping')}</h2>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleAddSelectedToShopping}
                            disabled={isAddingToShopping || selectedIngredients.length === 0 || !selectedListId}
                        >
                            {isAddingToShopping ? t('common.loading') : t('rec.addSelected')}
                        </button>
                    </div>
                    <p className="recipe-row-meta">{t('rec.addShoppingHint')}</p>
                    <div className="form-group">
                        <label className="label" htmlFor="edit-shopping-list">{t('page.shopping')}</label>
                        <select
                            id="edit-shopping-list"
                            className="input"
                            value={selectedListId}
                            onChange={e => setSelectedListId(e.target.value)}
                            disabled={lists.length === 0}
                        >
                            {lists.length === 0 ? (
                                <option value="">{t('rec.noLists')}</option>
                            ) : (
                                lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)
                            )}
                        </select>
                    </div>
                    <div>
                        {recipe.ingredients.map((ing, idx) => (
                            <label key={`shopping-${idx}`} className="recipes-check-row">
                                <input
                                    type="checkbox"
                                    checked={selectedIngredients.includes(idx.toString())}
                                    onChange={() => toggleIngredientForShopping(idx)}
                                />
                                <span style={{ flex: 1 }}>
                                    {ing.name || t('rec.ingredientFallback', idx + 1)}
                                </span>
                                <span className="sub">
                                    {ing.quantity ?? ''} {ing.unit ?? ''}
                                </span>
                            </label>
                        ))}
                    </div>
                </section>

                <div className="recipes-form-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(`/recipes/${id}`)}>{t('common.cancel')}</button>
                    <button type="submit" className="btn btn-primary" disabled={isSaving}>
                        {isSaving ? t('common.loading') : t('common.save')}
                    </button>
                </div>
            </form>
        </div>
    );
}

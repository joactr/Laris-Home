import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { t } from '../../i18n';
import { toastError, toastSuccess } from '../../store/toast';

export default function RecipeEditPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [recipe, setRecipe] = useState<any | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [lists, setLists] = useState<any[]>([]);
    const [selectedListId, setSelectedListId] = useState('');
    const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
    const [isAddingToShopping, setIsAddingToShopping] = useState(false);

    useEffect(() => {
        if (!id) return;
        api.recipes.getById(id)
            .then(data => {
                // Normalize data to camelCase for the form
                const normalized = {
                    ...data,
                    sourceUrl: data.sourceUrl ?? data.source_url ?? '',
                    imageUrl: data.imageUrl ?? data.image_url ?? '',
                    prepTimeMinutes: data.prepTimeMinutes ?? data.prep_time_minutes,
                    cookTimeMinutes: data.cookTimeMinutes ?? data.cook_time_minutes,
                    caloriesPerServing: data.caloriesPerServing ?? data.calories_per_serving,
                    proteinPerServing: data.proteinPerServing ?? data.protein_per_serving,
                    carbsPerServing: data.carbsPerServing ?? data.carbs_per_serving,
                    fatPerServing: data.fatPerServing ?? data.fat_per_serving,
                    ingredients: (data.ingredients || []).map((ing: any) => ({
                        ...ing,
                        originalText: ing.originalText ?? ing.original_text ?? '',
                    }))
                };
                setRecipe(normalized);
            })
            .catch(err => {
                setLoadError(err.message);
                toastError('No se pudo cargar la receta', err.message || 'Vuelve a intentarlo.');
            })
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        api.shopping.getLists().then(ls => {
            setLists(ls);
            setSelectedListId(current => current || ls[0]?.id || '');
        });
    }, []);

    const normalizeRecipe = (data: any) => ({
        ...data,
        sourceUrl: data.sourceUrl ?? data.source_url ?? '',
        imageUrl: data.imageUrl ?? data.image_url ?? '',
        prepTimeMinutes: data.prepTimeMinutes ?? data.prep_time_minutes,
        cookTimeMinutes: data.cookTimeMinutes ?? data.cook_time_minutes,
        caloriesPerServing: data.caloriesPerServing ?? data.calories_per_serving,
        proteinPerServing: data.proteinPerServing ?? data.protein_per_serving,
        carbsPerServing: data.carbsPerServing ?? data.carbs_per_serving,
        fatPerServing: data.fatPerServing ?? data.fat_per_serving,
        ingredients: (data.ingredients || []).map((ing: any) => ({
            ...ing,
            originalText: ing.originalText ?? ing.original_text ?? '',
        }))
    });

    const buildPayload = () => {
        const toNum = (v: any) => {
            const n = Number(v);
            return (v === '' || v === null || v === undefined || isNaN(n)) ? null : n;
        };

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
            ingredients: recipe.ingredients.map((ing: any) => ({
                name: ing.name,
                originalText: ing.originalText ?? ing.original_text ?? ing.name,
                quantity: toNum(ing.quantity),
                unit: ing.unit || null,
                notes: ing.notes || null,
            })),
            instructions: Array.isArray(recipe.instructions)
                ? recipe.instructions.filter((s: string) => s.trim() !== '')
                : (recipe.instructions || '').split('\n').filter((s: string) => s.trim() !== ''),
        };
    };

    const saveRecipe = async () => {
        if (!recipe || !id) return null;
        const updated = await api.recipes.update(id, buildPayload());
        const normalized = normalizeRecipe(updated);
        setRecipe(normalized);
        return normalized;
    };

    const handleSave = async () => {
        if (!recipe || !id) return;
        setIsSaving(true);
        try {
            await saveRecipe();
            toastSuccess('Receta actualizada');
            navigate(`/recipes/${id}`);
        } catch (err: any) {
            const msg = typeof err.message === 'string' ? err.message : JSON.stringify(err);
            setError(msg || 'Error al guardar la receta');
            toastError('No se pudo guardar la receta', msg || 'Vuelve a intentarlo.');
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
            const ingredientIds = selectedIngredients
                .map(idx => savedRecipe.ingredients?.[parseInt(idx, 10)]?.id)
                .filter(Boolean);

            if (ingredientIds.length === 0) {
                throw new Error('No hay ingredientes válidos para añadir. Guarda la receta y vuelve a intentarlo.');
            }

            await api.recipes.addToShoppingList(id, selectedListId, ingredientIds);
            setSelectedIngredients([]);
            toastSuccess('Ingredientes añadidos', 'Los ingredientes seleccionados ya están en la lista.');
        } catch (err: any) {
            const msg = typeof err.message === 'string' ? err.message : JSON.stringify(err);
            setError(msg || 'Error al añadir ingredientes a la lista');
            toastError('No se pudieron añadir los ingredientes', msg || 'Vuelve a intentarlo.');
        } finally {
            setIsAddingToShopping(false);
        }
    };

    const updateIngredient = (idx: number, field: string, value: any) => {
        const newIngs = recipe.ingredients.map((ing: any, i: number) =>
            i === idx ? { ...ing, [field]: value } : ing
        );
        setRecipe({ ...recipe, ingredients: newIngs });
    };

    const deleteIngredient = (idx: number) => {
        const newIngs = recipe.ingredients.filter((_: any, i: number) => i !== idx);
        setRecipe({ ...recipe, ingredients: newIngs });
    };

    const addIngredient = () => {
        setRecipe({
            ...recipe,
            ingredients: [
                ...recipe.ingredients,
                { name: '', originalText: '', quantity: null, unit: '', notes: '' }
            ]
        });
    };

    if (loading) return <div className="page" style={{ padding: '2rem', textAlign: 'center' }}>{t('common.loading')}</div>;
    if (loadError || !recipe) return <div className="page" style={{ padding: '2rem', color: 'red' }}>Error: {loadError || 'Receta no encontrada'}</div>;

    return (
        <div className="page">
            <div className="page-header">
                <div className="page-title">{t('common.edit')} Receta</div>
            </div>

            <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
                {error ? <div style={{ color: 'red', marginBottom: 16 }}>{error}</div> : null}
                <div className="form-group">
                    <label className="label">Título</label>
                    <input
                        className="input"
                        value={recipe.title}
                        onChange={e => setRecipe({ ...recipe, title: e.target.value })}
                    />
                </div>

                <div className="form-group">
                    <label className="label">Descripción</label>
                    <textarea
                        className="input"
                        value={recipe.description}
                        onChange={e => setRecipe({ ...recipe, description: e.target.value })}
                    />
                </div>

                <div className="form-group">
                    <label className="label">Enlace Original (opcional)</label>
                    <input
                        className="input"
                        type="url"
                        placeholder="https://..."
                        value={recipe.sourceUrl || ''}
                        onChange={e => setRecipe({ ...recipe, sourceUrl: e.target.value })}
                    />
                </div>

                <div className="form-group">
                    <label className="label">URL de la Imagen (opcional)</label>
                    <input
                        className="input"
                        type="url"
                        placeholder="https://..."
                        value={recipe.imageUrl || ''}
                        onChange={e => setRecipe({ ...recipe, imageUrl: e.target.value })}
                    />
                    {recipe.imageUrl && (
                        <div style={{ marginTop: '8px' }}>
                            <img 
                                src={recipe.imageUrl} 
                                alt="Vista previa" 
                                style={{ maxHeight: '150px', borderRadius: '8px', objectFit: 'cover' }} 
                                onError={(e) => (e.currentTarget.style.display = 'none')}
                                onLoad={(e) => (e.currentTarget.style.display = 'block')}
                            />
                        </div>
                    )}
                </div>

                <div className="field-grid three">
                    <div className="form-group">
                        <label className="label">{t('recipes.servings')}</label>
                        <input
                            type="number"
                            className="input"
                            value={recipe.servings || ''}
                            onChange={e => setRecipe({ ...recipe, servings: parseInt(e.target.value) })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="label">{t('recipes.prepTime')}</label>
                        <input
                            type="number"
                            className="input"
                            value={recipe.prepTimeMinutes || ''}
                            onChange={e => setRecipe({ ...recipe, prepTimeMinutes: e.target.value === '' ? null : parseInt(e.target.value) })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="label">{t('recipes.cookTime')}</label>
                        <input
                            type="number"
                            className="input"
                            value={recipe.cookTimeMinutes || ''}
                            onChange={e => setRecipe({ ...recipe, cookTimeMinutes: e.target.value === '' ? null : parseInt(e.target.value) })}
                        />
                    </div>
                </div>

                <div className="field-grid four form-group-stack">
                    <div className="form-group">
                        <label className="label">{t('recipes.calories')}</label>
                        <input
                            type="number"
                            className="input"
                            value={recipe.caloriesPerServing || ''}
                            onChange={e => setRecipe({ ...recipe, caloriesPerServing: e.target.value === '' ? null : parseInt(e.target.value) })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="label">{t('recipes.protein')}</label>
                        <input
                            type="number"
                            className="input"
                            value={recipe.proteinPerServing || ''}
                            onChange={e => setRecipe({ ...recipe, proteinPerServing: e.target.value === '' ? null : parseFloat(e.target.value) })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="label">{t('recipes.carbs')}</label>
                        <input
                            type="number"
                            className="input"
                            value={recipe.carbsPerServing || ''}
                            onChange={e => setRecipe({ ...recipe, carbsPerServing: e.target.value === '' ? null : parseFloat(e.target.value) })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="label">{t('recipes.fat')}</label>
                        <input
                            type="number"
                            className="input"
                            value={recipe.fatPerServing || ''}
                            onChange={e => setRecipe({ ...recipe, fatPerServing: e.target.value === '' ? null : parseFloat(e.target.value) })}
                        />
                    </div>
                </div>

                {/* Ingredients */}
                <div className="form-group" style={{ marginTop: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <label className="label" style={{ marginBottom: 0 }}>{t('recipes.ingredients')}</label>
                        <button className="btn btn-secondary btn-sm" onClick={addIngredient}>+ Añadir ingrediente</button>
                    </div>

                    {/* Header row */}
                    <div className="recipe-ingredient-grid recipe-ingredient-grid-head">
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Nombre</span>
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Cantidad</span>
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>Unidad</span>
                        <span />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {recipe.ingredients.map((ing: any, idx: number) => (
                            <div key={idx} className="recipe-ingredient-grid">
                                <input
                                    className="input"
                                    style={{ fontSize: 13 }}
                                    placeholder="ej. Harina"
                                    value={ing.name}
                                    onChange={e => updateIngredient(idx, 'name', e.target.value)}
                                />
                                <input
                                    className="input"
                                    type="number"
                                    style={{ fontSize: 13 }}
                                    placeholder="ej. 200"
                                    value={ing.quantity ?? ''}
                                    onChange={e => updateIngredient(idx, 'quantity', e.target.value === '' ? null : parseFloat(e.target.value))}
                                />
                                <input
                                    className="input"
                                    style={{ fontSize: 13 }}
                                    placeholder="ej. g"
                                    value={ing.unit ?? ''}
                                    onChange={e => updateIngredient(idx, 'unit', e.target.value)}
                                />
                                <button
                                    className="btn-icon"
                                    style={{ color: 'var(--red)', padding: '6px 8px', fontSize: 16 }}
                                    onClick={() => deleteIngredient(idx)}
                                    title="Eliminar ingrediente"
                                >✕</button>
                            </div>
                        ))}
                        {recipe.ingredients.length === 0 && (
                            <p style={{ fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' }}>
                                Sin ingredientes. Pulsa "Añadir ingrediente" para empezar.
                            </p>
                        )}
                    </div>
                </div>

                <div className="form-group" style={{ marginTop: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <label className="label" style={{ marginBottom: 0 }}>Añadir ingredientes a la compra</label>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={handleAddSelectedToShopping}
                            disabled={isAddingToShopping || selectedIngredients.length === 0 || !selectedListId}
                        >
                            {isAddingToShopping ? t('common.loading') : 'Añadir seleccionados'}
                        </button>
                    </div>

                    <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--text2)' }}>
                        Esta acción guarda primero la receta actual y luego añade los ingredientes marcados.
                    </div>

                    <div className="form-group" style={{ marginBottom: 10 }}>
                        <select
                            className="input"
                            value={selectedListId}
                            onChange={e => setSelectedListId(e.target.value)}
                            disabled={lists.length === 0}
                        >
                            {lists.length === 0 ? (
                                <option value="">No hay listas de compra disponibles</option>
                            ) : (
                                lists.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)
                            )}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {recipe.ingredients.map((ing: any, idx: number) => (
                            <label key={`shopping-${idx}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    type="checkbox"
                                    className="checkbox-mini"
                                    checked={selectedIngredients.includes(idx.toString())}
                                    onChange={() => toggleIngredientForShopping(idx)}
                                />
                                <span style={{ flex: 1, fontSize: 14 }}>
                                    {ing.name || `Ingrediente ${idx + 1}`}
                                </span>
                                <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                                    {ing.quantity ?? ''} {ing.unit ?? ''}
                                </span>
                            </label>
                        ))}
                        {recipe.ingredients.length === 0 && (
                            <p style={{ fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' }}>
                                Añade ingredientes a la receta para poder enviarlos a la compra.
                            </p>
                        )}
                    </div>
                </div>

                {/* Instructions */}
                <div className="form-group" style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <label className="label" style={{ marginBottom: 0 }}>{t('recipes.instructions')}</label>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                                const steps = Array.isArray(recipe.instructions) ? recipe.instructions : (recipe.instructions || '').split('\n');
                                setRecipe({ ...recipe, instructions: [...steps, ''] });
                            }}
                        >+ Añadir paso</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(Array.isArray(recipe.instructions) ? recipe.instructions : (recipe.instructions || '').split('\n')).map((step: string, idx: number) => (
                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 36px', gap: 8, alignItems: 'flex-start' }}>
                                <span style={{
                                    fontSize: 12, fontWeight: 700, color: 'var(--accent2)',
                                    background: 'rgba(108,99,255,0.12)', borderRadius: '50%',
                                    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, marginTop: 2,
                                }}>{idx + 1}</span>
                                <textarea
                                    className="input"
                                    style={{ fontSize: 13, minHeight: 60, resize: 'vertical' }}
                                    placeholder={`Paso ${idx + 1}...`}
                                    value={step}
                                    onChange={e => {
                                        const steps = Array.isArray(recipe.instructions) ? [...recipe.instructions] : (recipe.instructions || '').split('\n');
                                        steps[idx] = e.target.value;
                                        setRecipe({ ...recipe, instructions: steps });
                                    }}
                                />
                                <button
                                    className="btn-icon"
                                    style={{ color: 'var(--red)', padding: '6px 8px', fontSize: 16, marginTop: 2 }}
                                    onClick={() => {
                                        const steps = (Array.isArray(recipe.instructions) ? recipe.instructions : (recipe.instructions || '').split('\n')).filter((_: string, i: number) => i !== idx);
                                        setRecipe({ ...recipe, instructions: steps });
                                    }}
                                    title="Eliminar paso"
                                >✕</button>
                            </div>
                        ))}
                        {((Array.isArray(recipe.instructions) ? recipe.instructions : (recipe.instructions || '').split('\n')).length === 0) && (
                            <p style={{ fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' }}>
                                Sin pasos. Pulsa "Añadir paso" para empezar.
                            </p>
                        )}
                    </div>
                </div>

                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={() => navigate(`/recipes/${id}`)}>{t('common.cancel')}</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? t('common.loading') : t('common.save')}
                    </button>
                </div>
                {error && <div style={{ color: 'var(--red)', marginTop: 10, fontSize: 13 }}>{error}</div>}
            </div>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { t } from '../../i18n';

export default function RecipeImportPage() {
    const navigate = useNavigate();
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recipe, setRecipe] = useState<any | null>(null);
    const [lists, setLists] = useState<any[]>([]);
    const [selectedListId, setSelectedListId] = useState('');
    const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        api.shopping.getLists().then(setLists);
    }, []);

    useEffect(() => {
        if (lists.length && !selectedListId) {
            setSelectedListId(lists[0].id);
        }
    }, [lists]);

    const handleImport = async () => {
        if (!url) return;
        setLoading(true);
        setError(null);
        try {
            const data = await api.recipes.importFromUrl(url);
            setRecipe({ ...data, sourceUrl: url });
            setSelectedIngredients(data.ingredients.map((_: any, i: number) => i.toString()));
        } catch (err: any) {
            setError(err.message || 'Error al importar la receta');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!recipe) return;
        setIsSaving(true);
        try {
            const savedRecipe = await api.recipes.save(recipe);
            
            // If ingredients are selected to be added to shopping list
            if (selectedIngredients.length > 0 && selectedListId) {
                const ingredientIds = selectedIngredients.map(idx => savedRecipe.ingredients[parseInt(idx)].id);
                await api.recipes.addToShoppingList(savedRecipe.id, selectedListId, ingredientIds);
            }
            
            navigate('/recipes');
        } catch (err: any) {
            setError(err.message || 'Error al guardar la receta');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleIngredient = (idx: number) => {
        const s = idx.toString();
        setSelectedIngredients(prev => 
            prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s]
        );
    };

    if (recipe) {
        return (
            <div className="page">
                <div className="page-header">
                    <div className="page-title">Revisar Receta Importada</div>
                </div>

                <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
                    <div className="form-group">
                        <label className="label">Título</label>
                        <input 
                            className="input" 
                            value={recipe.title} 
                            onChange={e => setRecipe({...recipe, title: e.target.value})} 
                        />
                    </div>
                    
                    <div className="form-group">
                        <label className="label">Descripción</label>
                        <textarea 
                            className="input" 
                            value={recipe.description} 
                            onChange={e => setRecipe({...recipe, description: e.target.value})}
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
                            <div style={{ marginTop: 8 }}>
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                        <div className="form-group">
                            <label className="label">{t('recipes.servings')}</label>
                            <input 
                                type="number" 
                                className="input" 
                                value={recipe.servings || ''} 
                                onChange={e => setRecipe({...recipe, servings: parseInt(e.target.value)})}
                            />
                        </div>
                        <div className="form-group">
                            <label className="label">{t('recipes.prepTime')}</label>
                            <input 
                                type="number" 
                                className="input" 
                                value={recipe.prepTimeMinutes || ''} 
                                onChange={e => setRecipe({...recipe, prepTimeMinutes: parseInt(e.target.value)})}
                            />
                        </div>
                        <div className="form-group">
                            <label className="label">{t('recipes.cookTime')}</label>
                            <input 
                                type="number" 
                                className="input" 
                                value={recipe.cookTimeMinutes || ''} 
                                onChange={e => setRecipe({...recipe, cookTimeMinutes: parseInt(e.target.value)})}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 16 }}>
                        <div className="form-group">
                            <label className="label">{t('recipes.calories')}</label>
                            <input 
                                type="number" 
                                className="input" 
                                value={recipe.caloriesPerServing || ''} 
                                onChange={e => setRecipe({...recipe, caloriesPerServing: parseInt(e.target.value)})}
                            />
                        </div>
                        <div className="form-group">
                            <label className="label">{t('recipes.protein')}</label>
                            <input 
                                type="number" 
                                className="input" 
                                value={recipe.proteinPerServing || ''} 
                                onChange={e => setRecipe({...recipe, proteinPerServing: parseInt(e.target.value)})}
                            />
                        </div>
                        <div className="form-group">
                            <label className="label">{t('recipes.carbs')}</label>
                            <input 
                                type="number" 
                                className="input" 
                                value={recipe.carbsPerServing || ''} 
                                onChange={e => setRecipe({...recipe, carbsPerServing: parseInt(e.target.value)})}
                            />
                        </div>
                        <div className="form-group">
                            <label className="label">{t('recipes.fat')}</label>
                            <input 
                                type="number" 
                                className="input" 
                                value={recipe.fatPerServing || ''} 
                                onChange={e => setRecipe({...recipe, fatPerServing: parseInt(e.target.value)})}
                            />
                        </div>
                    </div>

                    <div className="form-group" style={{ marginTop: 16 }}>
                        <label className="label">{t('recipes.ingredients')} (Selecciona para añadir a la lista)</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {recipe.ingredients.map((ing: any, idx: number) => (
                                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input 
                                        type="checkbox" 
                                        className="checkbox-mini"
                                        checked={selectedIngredients.includes(idx.toString())}
                                        onChange={() => toggleIngredient(idx)}
                                    />
                                    <input 
                                        className="input" 
                                        style={{ flex: 1 }}
                                        value={ing.name}
                                        onChange={e => {
                                            const newIngs = [...recipe.ingredients];
                                            newIngs[idx].name = e.target.value;
                                            setRecipe({...recipe, ingredients: newIngs});
                                        }}
                                    />
                                    <span style={{ fontSize: 12, color: '#666', width: 100 }}>{ing.quantity} {ing.unit}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {selectedIngredients.length > 0 && (
                        <div className="form-group" style={{ background: '#f5f5f5', padding: 12, borderRadius: 8 }}>
                            <label className="label">Añadir seleccionados a:</label>
                            <select 
                                className="input" 
                                value={selectedListId} 
                                onChange={e => setSelectedListId(e.target.value)}
                            >
                                {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="form-group">
                        <label className="label">{t('recipes.instructions')} (una por línea)</label>
                        <textarea 
                            className="input" 
                            style={{ minHeight: 200 }}
                            value={recipe.instructions.join('\n')} 
                            onChange={e => setRecipe({...recipe, instructions: e.target.value.split('\n')})}
                        />
                    </div>

                    <div className="modal-actions">
                        <button className="btn btn-secondary" onClick={() => setRecipe(null)}>{t('common.cancel')}</button>
                        <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                            {isSaving ? t('common.loading') : t('common.save')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <div className="page-title">{t('recipes.importUrl')}</div>
                    <div className="page-subtitle">Pega una URL para extraer los detalles automáticamente</div>
                </div>
            </div>

            <div className="card" style={{ maxWidth: 600, margin: '2rem auto' }}>
                <div className="form-group">
                    <label className="label">URL de la Receta</label>
                    <input 
                        className="input" 
                        placeholder="https://ejemplo.com/receta-de-pollo"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                    />
                </div>
                {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}
                <button 
                    className="btn btn-primary" 
                    style={{ width: '100%' }}
                    onClick={handleImport}
                    disabled={loading || !url}
                >
                    {loading ? t('common.loading') : t('recipes.importBtn')}
                </button>
            </div>
        </div>
    );
}

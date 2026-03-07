import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { t } from '../../i18n';

export default function RecipeDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [recipe, setRecipe] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lists, setLists] = useState<any[]>([]);
    const [showShoppingModal, setShowShoppingModal] = useState(false);
    const [selectedListId, setSelectedListId] = useState('');
    const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
    const [isAdding, setIsAdding] = useState(false);

    useEffect(() => {
        api.shopping.getLists().then(ls => {
            setLists(ls);
            if (ls.length > 0) setSelectedListId(ls[0].id);
        });
    }, []);

    useEffect(() => {
        if (!id) return;
        api.recipes.getById(id)
            .then(data => setRecipe(data))
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) return <div className="page" style={{ padding: '2rem', textAlign: 'center' }}>{t('common.loading')}</div>;
    if (error || !recipe) return <div className="page" style={{ padding: '2rem', color: 'red' }}>Error: {error || 'Receta no encontrada'}</div>;

    const hasMacros = recipe.calories_per_serving || recipe.protein_per_serving || recipe.carbs_per_serving || recipe.fat_per_serving;

    const handleDelete = async () => {
        if (!window.confirm('¿Eliminar esta receta?')) return;
        try {
            await api.recipes.delete(recipe.id);
            navigate('/recipes');
        } catch (err: any) {
            alert(err.message || 'Error deleting recipe');
        }
    };

    const toggleIngredient = (id: string) => {
        setSelectedIngredients(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleAddToShopping = async () => {
        if (!selectedListId || selectedIngredients.length === 0) return;
        setIsAdding(true);
        try {
            await api.recipes.addToShoppingList(recipe.id, selectedListId, selectedIngredients);
            alert('¡Ingredientes añadidos con éxito!');
            setShowShoppingModal(false);
            setSelectedIngredients([]);
        } catch (err: any) {
            alert(err.message || 'Error al añadir ingredientes');
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div className="page">
            <div className="recipe-detail-header">
                <div className="recipe-detail-title-section">
                    <div className="title-row">
                        <button className="btn-icon" onClick={() => navigate('/recipes')}>←</button>
                        <h1 className="page-title">{recipe.title}</h1>
                    </div>
                    {recipe.description && <p className="recipe-detail-description">{recipe.description}</p>}
                </div>
                <div className="recipe-detail-actions">
                    {recipe.source_url && (
                        <a href={recipe.source_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                            Ver original
                        </a>
                    )}
                    <button className="btn btn-primary btn-sm" onClick={() => navigate(`/recipes/${recipe.id}/edit`)}>
                        {t('common.edit')}
                    </button>
                    <button className="btn btn-secondary btn-sm btn-danger-text" onClick={handleDelete}>
                        {t('common.delete')}
                    </button>
                </div>
            </div>

            <div className="card recipe-detail-card" style={{ margin: '1rem auto' }}>
                {recipe.image_url && (
                    <div style={{ marginBottom: 24, borderRadius: 12, overflow: 'hidden', maxHeight: 400 }}>
                        <img 
                            src={recipe.image_url} 
                            alt={recipe.title} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                    </div>
                )}
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #eee' }}>
                    {recipe.servings && <div><strong>{t('recipes.servings')}:</strong> {recipe.servings}</div>}
                    {recipe.prep_time_minutes && <div><strong>{t('recipes.prepTime')}:</strong> {recipe.prep_time_minutes}m</div>}
                    {recipe.cook_time_minutes && <div><strong>{t('recipes.cookTime')}:</strong> {recipe.cook_time_minutes}m</div>}
                </div>

                {hasMacros && (
                    <div style={{ marginBottom: 24 }}>
                        <h3 style={{ marginTop: 0 }}>{t('recipes.nutrition')}</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                            {recipe.calories_per_serving && <div style={{ background: 'rgba(33, 150, 243, 0.15)', color: '#90caf9', border: '1px solid rgba(33, 150, 243, 0.3)', padding: '8px 12px', borderRadius: 8 }}><strong>{recipe.calories_per_serving}</strong> kcal</div>}
                            {recipe.carbs_per_serving && <div style={{ background: 'rgba(76, 175, 80, 0.15)', color: '#a5d6a7', border: '1px solid rgba(76, 175, 80, 0.3)', padding: '8px 12px', borderRadius: 8 }}><strong>{recipe.carbs_per_serving}g</strong> C</div>}
                            {recipe.fat_per_serving && <div style={{ background: 'rgba(156, 39, 176, 0.15)', color: '#ce93d8', border: '1px solid rgba(156, 39, 176, 0.3)', padding: '8px 12px', borderRadius: 8 }}><strong>{recipe.fat_per_serving}g</strong> G</div>}
                            {recipe.protein_per_serving && <div style={{ background: 'rgba(255, 193, 7, 0.15)', color: '#ffe082', border: '1px solid rgba(255, 193, 7, 0.3)', padding: '8px 12px', borderRadius: 8 }}><strong>{recipe.protein_per_serving}g</strong> P</div>}
                        </div>
                    </div>
                )}

                <div className="recipe-detail-grid">
                    <div>
                        <h3 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            {t('recipes.ingredients')}
                            {selectedIngredients.length > 0 && (
                                <button className="btn btn-primary btn-xs" onClick={() => setShowShoppingModal(true)}>
                                    🛒 Añadir ({selectedIngredients.length})
                                </button>
                            )}
                        </h3>
                        <ul className="ingredients-list">
                            {recipe.ingredients?.map((ing: any) => (
                                <li key={ing.id} className="ingredient-item">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedIngredients.includes(ing.id)} 
                                        onChange={() => toggleIngredient(ing.id)} 
                                    />
                                    <span>
                                        {ing.quantity && <strong>{ing.quantity} </strong>}
                                        {ing.unit && <span>{ing.unit} </span>}
                                        {ing.name}
                                        {ing.notes && <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}> ({ing.notes})</span>}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    
                    <div>
                        <h3 style={{ marginTop: 0 }}>{t('recipes.instructions')}</h3>
                        <ol className="instructions-list">
                            {recipe.instructions.split('\n').filter((step: string) => step.trim().length > 0).map((step: string, i: number) => (
                                <li key={i} className="instruction-step">{step.trim()}</li>
                            ))}
                        </ol>
                    </div>
                </div>

            </div>

            {showShoppingModal && (
                <div className="modal-overlay" onClick={() => setShowShoppingModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">Añadir al carrito</span>
                            <button className="modal-close" onClick={() => setShowShoppingModal(false)}>×</button>
                        </div>
                        <div className="form-group">
                            <label className="label">{t('page.shopping')}</label>
                            <select className="input" value={selectedListId} onChange={e => setSelectedListId(e.target.value)}>
                                {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowShoppingModal(false)}>{t('common.cancel')}</button>
                            <button className="btn btn-primary" onClick={handleAddToShopping} disabled={isAdding}>
                                {isAdding ? t('common.loading') : t('common.save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

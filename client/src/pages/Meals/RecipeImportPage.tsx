import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { toastError, toastSuccess } from '../../store/toast';

export default function RecipeImportPage() {
    const navigate = useNavigate();
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recipe, setRecipe] = useState<any | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleImport = async () => {
        if (!url) return;
        setLoading(true);
        setError(null);
        try {
            const data = await api.recipes.importFromUrl(url);
            setRecipe({ ...data, sourceUrl: url });
        } catch (err: any) {
            const message = err.message || 'Error al importar la receta';
            setError(message);
            toastError('No se pudo importar la receta', message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!recipe) return;
        setIsSaving(true);
        try {
            await api.recipes.save(recipe);
            toastSuccess('Receta creada', 'La receta ya está disponible para planificar comidas.');
            navigate('/meals');
        } catch (err: any) {
            const message = err.message || 'Error al guardar la receta';
            setError(message);
            toastError('No se pudo guardar la receta', message);
        } finally {
            setIsSaving(false);
        }
    };

    if (recipe) {
        return (
            <div className="page">
                <div className="page-header">
                    <div className="page-title">Revisar Receta Importada</div>
                </div>

                <div className="card compact-form-card">
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

                    <div className="field-grid three">
                        <div className="form-group">
                            <label className="label">Raciones</label>
                            <input 
                                type="number" 
                                className="input" 
                                value={recipe.servings || ''} 
                                onChange={e => setRecipe({...recipe, servings: parseInt(e.target.value)})}
                            />
                        </div>
                        <div className="form-group">
                            <label className="label">Prep (min)</label>
                            <input 
                                type="number" 
                                className="input" 
                                value={recipe.prepTimeMinutes || ''} 
                                onChange={e => setRecipe({...recipe, prepTimeMinutes: parseInt(e.target.value)})}
                            />
                        </div>
                        <div className="form-group">
                            <label className="label">Cocción (min)</label>
                            <input 
                                type="number" 
                                className="input" 
                                value={recipe.cookTimeMinutes || ''} 
                                onChange={e => setRecipe({...recipe, cookTimeMinutes: parseInt(e.target.value)})}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="label">Ingredientes</label>
                        <div className="ingredient-edit-list">
                            {recipe.ingredients.map((ing: any, idx: number) => (
                                <div key={idx} className="ingredient-edit-row">
                                    <input 
                                        className="input" 
                                        value={ing.name}
                                        onChange={e => {
                                            const newIngs = [...recipe.ingredients];
                                            newIngs[idx].name = e.target.value;
                                            setRecipe({...recipe, ingredients: newIngs});
                                        }}
                                    />
                                    <span className="ingredient-edit-meta">{ing.quantity} {ing.unit}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="label">Instrucciones (una por línea)</label>
                        <textarea 
                            className="input" 
                            style={{ minHeight: 200 }}
                            value={recipe.instructions.join('\n')} 
                            onChange={e => setRecipe({...recipe, instructions: e.target.value.split('\n')})}
                        />
                    </div>

                    <div className="modal-actions">
                        <button className="btn btn-secondary" onClick={() => setRecipe(null)}>Cancelar</button>
                        <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                            {isSaving ? 'Guardando...' : 'Guardar Receta'}
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
                    <div className="page-title">Importar Receta</div>
                    <div className="page-subtitle">Pega una URL para extraer los detalles automáticamente</div>
                </div>
            </div>

            <div className="card compact-form-card compact-form-card-narrow">
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
                    {loading ? 'Importando...' : 'Importar'}
                </button>
            </div>
        </div>
    );
}

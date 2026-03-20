import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { t } from '../../i18n';
import { useVoiceStore } from '../../store/voice';
import ConfirmModal from '../../components/ConfirmModal';
import StatusModal from '../../components/StatusModal';

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
    
    // Modal state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
    const [proposedRecipe, setProposedRecipe] = useState<any | null>(null);
    const [isApplyingVoiceChange, setIsApplyingVoiceChange] = useState(false);
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [voiceFallback, setVoiceFallback] = useState<{ message: string; transcript: string } | null>(null);

    const load = useCallback(() => {
        if (!id) return;
        setLoading(true);
        api.recipes.getById(id)
            .then(data => setRecipe(data))
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const handleVoiceResult = useCallback(async (transcript: string) => {
        if (!id) return;
        try {
            const res = await api.voice.processRecipeCommand(transcript, id);
            setVoiceTranscript(res.transcript || transcript);
            
            if (res.status === 'needs_review' && res.modified && res.proposedRecipe) {
                setProposedRecipe(res.proposedRecipe);
                setVoiceMessage(res.message);
                setVoiceFallback(null);
            } else {
                if (res.status === 'fallback') {
                    setVoiceFallback({
                        message: res.message,
                        transcript: res.transcript || transcript,
                    });
                } else {
                    setVoiceMessage(res.message);
                    setVoiceFallback(null);
                }
            }
        } catch (err: any) {
            setVoiceFallback({
                message: err.message || t('common.error'),
                transcript,
            });
        }
    }, [id]);

    const applyProposedChange = async () => {
        if (!id || !proposedRecipe) return;
        setIsApplyingVoiceChange(true);
        try {
            const updated = await api.recipes.update(id, {
                ...proposedRecipe,
                imageUrl: recipe.image_url
            });
            setRecipe(updated);
            setProposedRecipe(null);
            setVoiceMessage(null);
        } catch (err: any) {
            setVoiceFallback({
                message: err.message || t('common.error'),
                transcript: voiceTranscript,
            });
        } finally {
            setIsApplyingVoiceChange(false);
        }
    };

    useEffect(() => {
        const voiceStore = useVoiceStore.getState();
        voiceStore.register(handleVoiceResult, t('voice.placeholder.recipe_detail'));
        return () => voiceStore.unregister();
    }, [handleVoiceResult]);

    // Separate useEffect for shopping lists as it's independent of recipe load
    useEffect(() => {
        api.shopping.getLists().then(ls => {
            setLists(ls);
            if (ls.length > 0) setSelectedListId(ls[0].id);
        });
    }, []);

    if (loading) return <div className="loading-center"><div className="spinner" /></div>;
    if (error || !recipe) return <div className="page" style={{ padding: '2rem', color: 'red' }}>Error: {error || 'Receta no encontrada'}</div>;

    const hasMacros = recipe.calories_per_serving || recipe.protein_per_serving || recipe.carbs_per_serving || recipe.fat_per_serving;

    const handleDelete = async () => {
        try {
            await api.recipes.delete(recipe.id);
            setShowDeleteConfirm(false);
            navigate('/recipes');
        } catch (err: any) {
            setVoiceFallback({
                message: err.message || 'Error deleting recipe',
                transcript: '',
            });
        }
    };

    const toggleIngredient = (id: string) => {
        setSelectedIngredients((prev: string[]) => 
            prev.includes(id) ? prev.filter((i: string) => i !== id) : [...prev, id]
        );
    };

    const handleAddToShopping = async () => {
        if (!selectedListId || selectedIngredients.length === 0) return;
        setIsAdding(true);
        try {
            await api.recipes.addToShoppingList(recipe.id, selectedListId, selectedIngredients);
            setVoiceFallback({
                message: '¡Ingredientes añadidos con éxito!',
                transcript: '',
            });
            setShowShoppingModal(false);
            setSelectedIngredients([]);
        } catch (err: any) {
            setVoiceFallback({
                message: err.message || 'Error al añadir ingredientes',
                transcript: '',
            });
        } finally {
            setIsAdding(false);
        }
    };


    return (
        <div className="page">
            <div className="recipe-detail-header">
                <div className="recipe-detail-title-section">
                    <div className="title-row">
                        <button className="btn-icon touch-target" onClick={() => navigate('/recipes')} aria-label={t('common.back')}>←</button>
                        <h1 className="page-title">{recipe.title}</h1>
                    </div>
                    {recipe.description && <p className="recipe-detail-description">{recipe.description}</p>}
                </div>
                <div className="recipe-detail-actions">
                    {recipe.source_url && (
                        <a href={recipe.source_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm touch-target">
                            Ver original
                        </a>
                    )}
                    <button className="btn btn-primary btn-sm touch-target" onClick={() => navigate(`/recipes/${recipe.id}/edit`)}>
                        {t('common.edit')}
                    </button>
                    <button className="btn btn-secondary btn-sm btn-danger-text touch-target" onClick={() => setShowDeleteConfirm(true)}>
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
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                    {!!recipe.servings && <div><strong>{t('recipes.servings')}:</strong> {recipe.servings}</div>}
                    {!!recipe.prep_time_minutes && <div><strong>{t('recipes.prepTime')}:</strong> {recipe.prep_time_minutes}m</div>}
                    {!!recipe.cook_time_minutes && <div><strong>{t('recipes.cookTime')}:</strong> {recipe.cook_time_minutes}m</div>}
                </div>

                {hasMacros && (
                    <div style={{ marginBottom: 24 }}>
                        <h3 style={{ marginTop: 0 }}>{t('recipes.nutrition')}</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                            {!!recipe.calories_per_serving && <div style={{ background: 'rgba(33, 150, 243, 0.15)', color: '#90caf9', border: '1px solid rgba(33, 150, 243, 0.3)', padding: '8px 12px', borderRadius: 8 }}><strong>{recipe.calories_per_serving}</strong> kcal</div>}
                            {!!recipe.carbs_per_serving && <div style={{ background: 'rgba(76, 175, 80, 0.15)', color: '#a5d6a7', border: '1px solid rgba(76, 175, 80, 0.3)', padding: '8px 12px', borderRadius: 8 }}><strong>{recipe.carbs_per_serving}g</strong> C</div>}
                            {!!recipe.fat_per_serving && <div style={{ background: 'rgba(156, 39, 176, 0.15)', color: '#ce93d8', border: '1px solid rgba(156, 39, 176, 0.3)', padding: '8px 12px', borderRadius: 8 }}><strong>{recipe.fat_per_serving}g</strong> G</div>}
                            {!!recipe.protein_per_serving && <div style={{ background: 'rgba(255, 193, 7, 0.15)', color: '#ffe082', border: '1px solid rgba(255, 193, 7, 0.3)', padding: '8px 12px', borderRadius: 8 }}><strong>{recipe.protein_per_serving}g</strong> P</div>}
                        </div>
                    </div>
                )}

                <div className="recipe-detail-grid">
                    <div>
                        <h3 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            {t('recipes.ingredients')}
                            {selectedIngredients.length > 0 && (
                                <button className="btn btn-primary btn-xs touch-target" onClick={() => setShowShoppingModal(true)}>
                                    🛒 Añadir ({selectedIngredients.length})
                                </button>
                            )}
                        </h3>
                        <ul className="ingredients-list">
                            {recipe.ingredients?.map((ing: any) => (
                                <li key={ing.id} className="ingredient-item">
                                    <input 
                                        type="checkbox" 
                                        className="checkbox-mini touch-target"
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

            {/* Shopping List Selection Modal */}
            {showShoppingModal && (
                <div className="modal-overlay" onClick={() => setShowShoppingModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">Añadir al carrito</span>
                            <button className="modal-close touch-target" onClick={() => setShowShoppingModal(false)} aria-label={t('common.close')}>×</button>
                        </div>
                        <div className="form-group">
                            <label className="label" htmlFor="list-select">{t('page.shopping')}</label>
                            <select id="list-select" className="input" value={selectedListId} onChange={e => setSelectedListId(e.target.value)}>
                                {lists.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
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

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={showDeleteConfirm}
                title={t('common.delete')}
                message={t('recipes.deleteConfirm')}
                onConfirm={handleDelete}
                onCancel={() => setShowDeleteConfirm(false)}
                isDanger
            />

            {/* Voice Message Feedback */}
            {voiceMessage && (
                <div className="modal-overlay" onClick={() => setVoiceMessage(null)}>
                    <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">Asistente de Voz</span>
                            <button className="modal-close" onClick={() => setVoiceMessage(null)}>×</button>
                        </div>
                        <div style={{ padding: '0 0 16px' }}>
                            {voiceMessage}
                            {voiceTranscript && (
                                <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 10, marginTop: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                                    <strong>{t('voice.transcriptLabel')}:</strong> {voiceTranscript}
                                </div>
                            )}
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-primary" onClick={() => setVoiceMessage(null)}>{t('common.close')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Voice Modification Confirmation Modal */}
            <ConfirmModal
                isOpen={!!proposedRecipe}
                title="Confirmar cambios AI"
                message={`${voiceMessage || "¿Deseas aplicar estos cambios a la receta?"}${voiceTranscript ? `\n\n${t('voice.transcriptLabel')}: ${voiceTranscript}` : ''}`}
                onConfirm={applyProposedChange}
                onCancel={() => {
                    setProposedRecipe(null);
                    setVoiceMessage(null);
                }}
                confirmText={isApplyingVoiceChange ? t('common.loading') : t('common.save')}
            />

            <StatusModal
                isOpen={!!voiceFallback}
                title={t('recipes.voiceRecipeChangeTitle')}
                message={voiceFallback?.message || ''}
                details={voiceFallback?.transcript ? `${t('voice.transcriptLabel')}: ${voiceFallback.transcript}` : null}
                primaryText={voiceFallback?.transcript ? t('common.retry') : undefined}
                secondaryText={voiceFallback?.transcript ? t('common.close') : undefined}
                onPrimary={voiceFallback?.transcript ? () => handleVoiceResult(voiceFallback.transcript) : undefined}
                onSecondary={voiceFallback?.transcript ? () => setVoiceFallback(null) : undefined}
                onClose={() => setVoiceFallback(null)}
            />
        </div>
    );
}

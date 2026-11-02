import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { t } from '../../i18n';
import { useVoiceStore } from '../../store/voice';
import ConfirmModal from '../../components/ConfirmModal';
import StatusModal from '../../components/StatusModal';
import Icon from '../../components/Icon';
import type {
    RecipeRecord,
    ShoppingList,
    VoiceRecipeCommandProposal,
} from '../../../../shared/contracts';
import './Recipes.css';

export default function RecipeDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [recipe, setRecipe] = useState<RecipeRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lists, setLists] = useState<ShoppingList[]>([]);
    const [showShoppingModal, setShowShoppingModal] = useState(false);
    const [selectedListId, setSelectedListId] = useState('');
    const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
    const [isAdding, setIsAdding] = useState(false);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
    const [proposedRecipe, setProposedRecipe] = useState<VoiceRecipeCommandProposal | null>(null);
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
        } catch (err: unknown) {
            setVoiceFallback({
                message: err instanceof Error ? err.message : t('common.error'),
                transcript,
            });
        }
    }, [id]);

    const applyProposedChange = async () => {
        if (!id || !proposedRecipe || !recipe) return;
        setIsApplyingVoiceChange(true);
        try {
            const updated = await api.recipes.update(id, {
                ...proposedRecipe,
                imageUrl: recipe.image_url
            });
            setRecipe(updated);
            setProposedRecipe(null);
            setVoiceMessage(null);
        } catch (err: unknown) {
            setVoiceFallback({
                message: err instanceof Error ? err.message : t('common.error'),
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

    useEffect(() => {
        api.shopping.getLists().then(ls => {
            setLists(ls);
            if (ls.length > 0) setSelectedListId(ls[0].id);
        });
    }, []);

    if (loading) return <div className="loading-center"><div className="spinner" /></div>;
    if (error || !recipe) return <div className="page"><p className="form-error" role="alert">{error || t('rec.notFound')}</p></div>;

    const mins = (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0);

    const nutrition: Array<[string, string]> = [];
    if (recipe.calories_per_serving) nutrition.push([t('recipes.calories'), `${recipe.calories_per_serving} kcal`]);
    if (recipe.protein_per_serving) nutrition.push([t('recipes.protein'), `${recipe.protein_per_serving} g`]);
    if (recipe.carbs_per_serving) nutrition.push([t('recipes.carbs'), `${recipe.carbs_per_serving} g`]);
    if (recipe.fat_per_serving) nutrition.push([t('recipes.fat'), `${recipe.fat_per_serving} g`]);

    const tags = (recipe.tags || []).map((tag) => tag.name);

    const handleDelete = async () => {
        try {
            await api.recipes.delete(recipe.id);
            setShowDeleteConfirm(false);
            navigate('/recipes');
        } catch (err: unknown) {
            setVoiceFallback({
                message: err instanceof Error ? err.message : t('rec.deleteFail'),
                transcript: '',
            });
        }
    };

    const toggleIngredient = (ingredientId: string) => {
        setSelectedIngredients((prev: string[]) =>
            prev.includes(ingredientId) ? prev.filter((i: string) => i !== ingredientId) : [...prev, ingredientId]
        );
    };

    const handleAddToShopping = async () => {
        if (!selectedListId || selectedIngredients.length === 0) return;
        setIsAdding(true);
        try {
            await api.recipes.addToShoppingList(recipe.id, selectedListId, selectedIngredients);
            setVoiceFallback({
                message: t('rec.ingredientsAddedDetail'),
                transcript: '',
            });
            setShowShoppingModal(false);
            setSelectedIngredients([]);
        } catch (err: unknown) {
            setVoiceFallback({
                message: err instanceof Error ? err.message : t('rec.addIngredientsFail'),
                transcript: '',
            });
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div className="page">
            <div className="recipe-detail-top">
                <button className="icon-button" onClick={() => navigate('/recipes')} aria-label={t('common.back')}>
                    <Icon name="chevronLeft" size={20} />
                </button>
                <h1>{recipe.title}</h1>
            </div>

            <div className={`recipe-detail-head${recipe.image_url ? ' has-image' : ''}`}>
                <div className="recipe-detail-info">
                    {recipe.servings || mins ? (
                        <p className="recipe-detail-meta">
                            {recipe.servings ? <span>{t('rec.servingsShort', recipe.servings)}</span> : null}
                            {mins ? <span>{mins} min</span> : null}
                        </p>
                    ) : null}
                    {tags.length > 0 ? (
                        <div className="recipe-detail-tags">
                            {tags.map((tag) => <span key={tag} className="status-badge">{tag}</span>)}
                        </div>
                    ) : null}
                    {recipe.description ? <p className="recipe-detail-desc">{recipe.description}</p> : null}
                    {nutrition.length > 0 ? (
                        <dl className="recipe-nutrition">
                            {nutrition.map(([label, value]) => (
                                <div key={label}>
                                    <dt>{label}</dt>
                                    <dd>{value}</dd>
                                </div>
                            ))}
                        </dl>
                    ) : null}
                    <div className="recipe-detail-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/recipes/${recipe.id}/edit`)}>
                            {t('common.edit')}
                        </button>
                        {recipe.source_url && (
                            <a href={recipe.source_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                                <Icon name="link" size={16} />
                                {t('rec.viewOriginal')}
                            </a>
                        )}
                        <button className="btn btn-ghost btn-sm btn-danger-text recipe-detail-delete" onClick={() => setShowDeleteConfirm(true)}>
                            {t('common.delete')}
                        </button>
                    </div>
                </div>
                {recipe.image_url ? (
                    <img
                        src={recipe.image_url}
                        alt=""
                        className="recipe-detail-hero"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                ) : null}
            </div>

            <div className="recipe-detail-grid">
                <section aria-label={t('recipes.ingredients')}>
                    <div className="recipe-ingredients-head">
                        <h2>{t('recipes.ingredients')}</h2>
                        {selectedIngredients.length > 0 ? (
                            <button className="btn btn-primary btn-sm" onClick={() => setShowShoppingModal(true)}>
                                {t('rec.addCount', selectedIngredients.length)}
                            </button>
                        ) : null}
                    </div>
                    <ul className="recipe-ingredients">
                        {recipe.ingredients?.map((ing) => (
                            <li key={ing.id}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={selectedIngredients.includes(ing.id)}
                                        onChange={() => toggleIngredient(ing.id)}
                                    />
                                    <span>
                                        {ing.quantity ? <span className="qty">{ing.quantity} </span> : null}
                                        {ing.unit ? <span>{ing.unit} </span> : null}
                                        {ing.name}
                                        {ing.notes ? <span className="notes"> ({ing.notes})</span> : null}
                                    </span>
                                </label>
                            </li>
                        ))}
                    </ul>
                </section>

                <section aria-label={t('recipes.instructions')}>
                    <h2>{t('recipes.instructions')}</h2>
                    <ol className="recipe-instructions">
                        {recipe.instructions.split('\n').filter((step: string) => step.trim().length > 0).map((step: string, i: number) => (
                            <li key={i}>{step.trim()}</li>
                        ))}
                    </ol>
                </section>
            </div>

            {showShoppingModal && (
                <div className="modal-overlay" onClick={() => setShowShoppingModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{t('rec.addToShopping')}</span>
                            <button className="modal-close touch-target" onClick={() => setShowShoppingModal(false)} aria-label={t('common.close')}>
                                <Icon name="close" size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <label className="label" htmlFor="detail-list-select">{t('page.shopping')}</label>
                            <select id="detail-list-select" className="input" value={selectedListId} onChange={e => setSelectedListId(e.target.value)}>
                                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                            <div className="modal-actions">
                                <button className="btn btn-secondary" onClick={() => setShowShoppingModal(false)}>{t('common.cancel')}</button>
                                <button className="btn btn-primary" onClick={handleAddToShopping} disabled={isAdding}>
                                    {isAdding ? t('common.loading') : t('common.save')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={showDeleteConfirm}
                title={t('common.delete')}
                message={t('recipes.deleteConfirm')}
                onConfirm={handleDelete}
                onCancel={() => setShowDeleteConfirm(false)}
                isDanger
            />

            {voiceMessage && (
                <div className="modal-overlay" onClick={() => setVoiceMessage(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{t('rec.voiceTitle')}</span>
                            <button className="modal-close touch-target" onClick={() => setVoiceMessage(null)} aria-label={t('common.close')}>
                                <Icon name="close" size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p>{voiceMessage}</p>
                            {voiceTranscript && (
                                <div className="modal-details">
                                    <strong>{t('voice.transcriptLabel')}:</strong> {voiceTranscript}
                                </div>
                            )}
                            <div className="modal-actions">
                                <button className="btn btn-primary" onClick={() => setVoiceMessage(null)}>{t('common.close')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={!!proposedRecipe}
                title={t('rec.confirmChanges')}
                message={`${voiceMessage || t('rec.applyChangesConfirm')}${voiceTranscript ? `\n\n${t('voice.transcriptLabel')}: ${voiceTranscript}` : ''}`}
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

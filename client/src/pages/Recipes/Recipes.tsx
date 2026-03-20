import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { t } from '../../i18n';
import { useVoiceStore } from '../../store/voice';
import StatusModal from '../../components/StatusModal';

export default function Recipes() {
    const navigate = useNavigate();
    const [recipes, setRecipes] = useState<any[]>([]);
    const [search, setSearch] = useState('');

    const [suggestedRecipes, setSuggestedRecipes] = useState<any[] | null>(null);
    const [voiceMessage, setVoiceMessage] = useState<string>('');
    const [savingIndex, setSavingIndex] = useState<number | null>(null);
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [voiceFallback, setVoiceFallback] = useState<{ message: string; transcript: string } | null>(null);
    
    // AI Enriching confirmation state
    const [recipeToEnrich, setRecipeToEnrich] = useState<{name: string, ingredients: string[], instructions: string, index: number, imageUrl: string} | null>(null);

    const load = async () => {
        const data = await api.recipes.getAll();
        setRecipes(data);
    };

    useEffect(() => { load(); }, []);

    const filtered = recipes.filter(r => 
        r.title.toLowerCase().includes(search.toLowerCase()) || 
        (r.description || '').toLowerCase().includes(search.toLowerCase())
    );

    const handleVoiceResult = useCallback(async (finalText: string) => {
        try {
            const res = await api.voice.processRecipes(finalText);
            setVoiceTranscript(res.transcript || finalText);
            if (res.status === 'needs_review' && res.recipes && res.recipes.length) {
                setSuggestedRecipes(res.recipes);
                setVoiceMessage(res.message || t('recipes.suggestedTitle'));
                setVoiceFallback(null);
            } else {
                setSearch(finalText);
                setVoiceFallback({
                    message: res.message || t('voice.error.noRecipes'),
                    transcript: res.transcript || finalText,
                });
            }
        } catch (err: any) {
            setSearch(finalText);
            setVoiceFallback({
                message: err.message || t('common.error'),
                transcript: finalText,
            });
        }
    }, []);

    useEffect(() => {
        const voiceStore = useVoiceStore.getState();
        voiceStore.register(handleVoiceResult, t('voice.placeholder.recipes'));
        return () => voiceStore.unregister();
    }, [handleVoiceResult]);

    const confirmEnrich = async () => {
        if (!recipeToEnrich) return;
        const { name, ingredients, instructions, index, imageUrl } = recipeToEnrich;
        setRecipeToEnrich(null);
        try {
            setSavingIndex(index);
            await api.recipes.createEnriched({
                title: name,
                ingredients,
                instructions,
                imageUrl,
            });
            alert(t('recipes.saveNewAiSuccess'));
            load();
            setSuggestedRecipes(null);
        } catch(e) {
            alert(t('common.error'));
        } finally {
            setSavingIndex(null);
        }
    };

    return (
        <div className="page full-width">
            <div className="page-header">
                <div className="page-title">{t('page.recipes')}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn btn-primary btn-sm touch-target" onClick={() => navigate('/recipes/import')}>
                        {t('recipes.importUrl')}
                    </button>
                </div>
            </div>

            <div className="form-group" style={{ maxWidth: 400, marginBottom: 24 }}>
                <input 
                    className="input" 
                    placeholder={`${t('common.search')}...`}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    aria-label={t('common.search')}
                />
            </div>

            <div className="recipes-grid">
                {filtered.map(r => (
                    <div key={r.id} className="recipe-card" onClick={() => navigate(`/recipes/${r.id}`)}>
                        <div className="recipe-image-placeholder">
                            {r.image_url ? (
                                <img 
                                    src={r.image_url} 
                                    alt={r.title} 
                                    className="recipe-image"
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                            ) : null}
                        </div>
                        <div className="recipe-info">
                            <h3 className="recipe-title">{r.title}</h3>
                            <p className="recipe-description">{r.description}</p>
                            
                            {(r.calories_per_serving || r.protein_per_serving || r.carbs_per_serving || r.fat_per_serving) && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                                    {!!r.calories_per_serving && <span style={{ fontSize: 10, background: 'rgba(33,150,243,0.15)', color: '#90caf9', border: '1px solid rgba(33,150,243,0.3)', padding: '2px 6px', borderRadius: 6 }}><strong>{r.calories_per_serving}</strong> kcal</span>}
                                    {!!r.carbs_per_serving && <span style={{ fontSize: 10, background: 'rgba(76,175,80,0.15)', color: '#a5d6a7', border: '1px solid rgba(76,175,80,0.3)', padding: '2px 6px', borderRadius: 6 }}><strong>{r.carbs_per_serving}g</strong> C</span>}
                                    {!!r.fat_per_serving && <span style={{ fontSize: 10, background: 'rgba(156,39,176,0.15)', color: '#ce93d8', border: '1px solid rgba(156,39,176,0.3)', padding: '2px 6px', borderRadius: 6 }}><strong>{r.fat_per_serving}g</strong> G</span>}
                                    {!!r.protein_per_serving && <span style={{ fontSize: 10, background: 'rgba(255,193,7,0.15)', color: '#ffe082', border: '1px solid rgba(255,193,7,0.3)', padding: '2px 6px', borderRadius: 6 }}><strong>{r.protein_per_serving}g</strong> P</span>}
                                </div>
                            )}
                            
                            <div className="recipe-meta">
                                {!!r.prep_time_minutes && <span>⏱ {r.prep_time_minutes}m</span>}
                                {!!r.cook_time_minutes && <span>🍳 {r.cook_time_minutes}m</span>}
                                {!!r.servings && <span>🍽 {r.servings} p.</span>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Voice Recipes Suggestions Modal */}
            {suggestedRecipes && (
                <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '10vh', overflowY: 'auto' }} onClick={() => setSuggestedRecipes(null)}>
                    <div className="modal" style={{ width: '90%', maxWidth: 600, margin: 'auto' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{t('recipes.suggestedTitle')}</span>
                            <button className="modal-close touch-target" onClick={() => setSuggestedRecipes(null)} aria-label={t('common.close')}>×</button>
                        </div>
                        <div style={{ padding: '0 0 16px', maxHeight: '70vh', overflowY: 'auto' }}>
                            <p style={{ marginBottom: 16 }}>{voiceMessage}</p>
                            {voiceTranscript && (
                                <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 10, marginBottom: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                                    <strong>{t('voice.transcriptLabel')}:</strong> {voiceTranscript}
                                </div>
                            )}
                            <div style={{ display: 'grid', gap: 16 }}>
                                {suggestedRecipes.map((r, idx) => (
                                    <div key={idx} style={{ background: 'var(--bg-tertiary)', padding: "12px", borderRadius: 8 }}>
                                        <h3 style={{ margin: '0 0 8px 0' }}>{r.name}</h3>
                                        <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' }}>⏱ {r.time}</div>
                                        <div style={{ fontSize: 13, marginBottom: 8 }}><strong>{t('recipes.ingredients')}:</strong> {r.ingredients.join(', ')}</div>
                                        <p style={{ fontSize: 14, margin: '0 0 12px 0', lineHeight: 1.4 }}>{r.instructions}</p>
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                            {r.id ? (
                                                <button className="btn btn-primary btn-sm touch-target" onClick={() => navigate(`/recipes/${r.id}`)}>
                                                    {t('recipes.existingMatching')}
                                                </button>
                                            ) : (
                                                <button 
                                                    className="btn btn-secondary btn-sm touch-target" 
                                                    disabled={savingIndex !== null}
                                                    onClick={() => setRecipeToEnrich({ name: r.name, ingredients: r.ingredients, instructions: r.instructions, index: idx, imageUrl: r.image || '' })}
                                                >
                                                    {savingIndex === idx ? t('recipes.savingAi') : t('recipes.saveNewAi')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {recipeToEnrich && (
                <div className="modal-overlay" onClick={() => setRecipeToEnrich(null)}>
                    <div className="modal" style={{ width: '90%', maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{t('recipes.saveNewAi')}</span>
                            <button className="modal-close touch-target" onClick={() => setRecipeToEnrich(null)} aria-label={t('common.close')}>×</button>
                        </div>
                        <div style={{ padding: '0 0 16px' }}>
                            <p style={{ marginBottom: 16 }}>{t('recipes.saveNewAiConfirm', recipeToEnrich.name)}</p>
                            <div className="form-group">
                                <label className="label">URL de la Imagen (opcional)</label>
                                <input
                                    className="input"
                                    type="url"
                                    placeholder="https://..."
                                    value={recipeToEnrich.imageUrl}
                                    onChange={e => setRecipeToEnrich({ ...recipeToEnrich, imageUrl: e.target.value })}
                                />
                            </div>
                            {recipeToEnrich.imageUrl && (
                                <div style={{ marginTop: 8 }}>
                                    <img
                                        src={recipeToEnrich.imageUrl}
                                        alt="Vista previa"
                                        style={{ width: '100%', maxHeight: '220px', borderRadius: '8px', objectFit: 'cover' }}
                                        onError={(e) => (e.currentTarget.style.display = 'none')}
                                        onLoad={(e) => (e.currentTarget.style.display = 'block')}
                                    />
                                </div>
                            )}
                            <div className="modal-actions" style={{ marginTop: 16 }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setRecipeToEnrich(null)}>{t('common.cancel')}</button>
                                <button type="button" className="btn btn-primary" onClick={confirmEnrich}>
                                    {savingIndex === recipeToEnrich.index ? t('recipes.savingAi') : t('common.save')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <StatusModal
                isOpen={!!voiceFallback}
                title={t('recipes.voiceFallbackTitle')}
                message={voiceFallback?.message || ''}
                details={voiceFallback?.transcript ? `${t('voice.transcriptLabel')}: ${voiceFallback.transcript}` : null}
                primaryText={t('common.retry')}
                secondaryText={t('common.close')}
                onPrimary={voiceFallback?.transcript ? () => handleVoiceResult(voiceFallback.transcript) : undefined}
                onSecondary={() => setVoiceFallback(null)}
                onClose={() => setVoiceFallback(null)}
            />
        </div>
    );
}

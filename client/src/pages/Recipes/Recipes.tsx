import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { t } from '../../i18n';
import { useVoiceStore } from '../../store/voice';
import ConfirmModal from '../../components/ConfirmModal';

export default function Recipes() {
    const navigate = useNavigate();
    const [recipes, setRecipes] = useState<any[]>([]);
    const [search, setSearch] = useState('');

    const [suggestedRecipes, setSuggestedRecipes] = useState<any[] | null>(null);
    const [voiceMessage, setVoiceMessage] = useState<string>('');
    const [savingIndex, setSavingIndex] = useState<number | null>(null);
    
    // AI Enriching confirmation state
    const [recipeToEnrich, setRecipeToEnrich] = useState<{name: string, ingredients: string[], instructions: string, index: number} | null>(null);

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
            if (res.recipes && res.recipes.length) {
                setSuggestedRecipes(res.recipes);
                setVoiceMessage(res.message || t('recipes.suggestedTitle'));
            } else {
                alert(t('voice.error.noRecipes'));
            }
        } catch (err: any) {
            alert(err.message || t('common.error'));
        }
    }, []);

    useEffect(() => {
        const voiceStore = useVoiceStore.getState();
        voiceStore.register(handleVoiceResult, t('voice.placeholder.recipes'));
        return () => voiceStore.unregister();
    }, [handleVoiceResult]);

    const confirmEnrich = async () => {
        if (!recipeToEnrich) return;
        const { name, ingredients, instructions, index } = recipeToEnrich;
        setRecipeToEnrich(null);
        try {
            setSavingIndex(index);
            await api.recipes.createEnriched({
                title: name,
                ingredients,
                instructions,
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
                                                    onClick={() => setRecipeToEnrich({ name: r.name, ingredients: r.ingredients, instructions: r.instructions, index: idx })}
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

            {/* AI Enrichment Confirmation Modal */}
            <ConfirmModal
                isOpen={!!recipeToEnrich}
                title={t('recipes.saveNewAi')}
                message={t('recipes.saveNewAiConfirm', recipeToEnrich?.name || '')}
                onConfirm={confirmEnrich}
                onCancel={() => setRecipeToEnrich(null)}
            />
        </div>
    );
}

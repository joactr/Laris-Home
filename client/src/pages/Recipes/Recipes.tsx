import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { t } from '../../i18n';
import { useVoiceAssistant } from '../../hooks/useVoiceAssistant';

export default function Recipes() {
    const navigate = useNavigate();
    const [recipes, setRecipes] = useState<any[]>([]);
    const [search, setSearch] = useState('');

    const { isListening, isProcessing, transcript, error: voiceError, startListening, stopListening } = useVoiceAssistant();
    const [suggestedRecipes, setSuggestedRecipes] = useState<any[] | null>(null);
    const [voiceMessage, setVoiceMessage] = useState<string>('');

    const load = async () => {
        const data = await api.recipes.getAll();
        setRecipes(data);
    };

    useEffect(() => { load(); }, []);

    const filtered = recipes.filter(r => 
        r.title.toLowerCase().includes(search.toLowerCase()) || 
        (r.description || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="page full-width">
            <div className="page-header">
                <div>
                    <div className="page-title">{t('page.recipes')}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/recipes/import')}>
                        {t('recipes.importUrl')}
                    </button>
                </div>
            </div>

            <div className="form-group" style={{ maxWidth: 400, marginBottom: 16 }}>
                <input 
                    className="input" 
                    placeholder={`${t('common.search')}...`}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            <div className="recipes-grid">
                {filtered.map(r => (
                    <div key={r.id} className="recipe-card" onClick={() => navigate(`/recipes/${r.id}`)}>
                        {r.image_url ? (
                            <div className="recipe-image-placeholder">
                                <img 
                                    src={r.image_url} 
                                    alt={r.title} 
                                    className="recipe-image"
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                            </div>
                        ) : (
                            <div className="recipe-image-placeholder"></div>
                        )}
                        <div className="recipe-info">
                            <h3 className="recipe-title">{r.title}</h3>
                        <p className="recipe-description">{r.description}</p>
                        
                        {(r.calories_per_serving || r.protein_per_serving || r.carbs_per_serving || r.fat_per_serving) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                                {r.calories_per_serving && <span style={{ fontSize: 10, background: 'rgba(33,150,243,0.15)', color: '#90caf9', border: '1px solid rgba(33,150,243,0.3)', padding: '2px 6px', borderRadius: 6 }}><strong>{r.calories_per_serving}</strong> kcal</span>}
                                {r.carbs_per_serving && <span style={{ fontSize: 10, background: 'rgba(76,175,80,0.15)', color: '#a5d6a7', border: '1px solid rgba(76,175,80,0.3)', padding: '2px 6px', borderRadius: 6 }}><strong>{r.carbs_per_serving}g</strong> C</span>}
                                {r.fat_per_serving && <span style={{ fontSize: 10, background: 'rgba(156,39,176,0.15)', color: '#ce93d8', border: '1px solid rgba(156,39,176,0.3)', padding: '2px 6px', borderRadius: 6 }}><strong>{r.fat_per_serving}g</strong> G</span>}
                                {r.protein_per_serving && <span style={{ fontSize: 10, background: 'rgba(255,193,7,0.15)', color: '#ffe082', border: '1px solid rgba(255,193,7,0.3)', padding: '2px 6px', borderRadius: 6 }}><strong>{r.protein_per_serving}g</strong> P</span>}
                            </div>
                        )}
                        
                        <div className="recipe-meta">
                            {r.prep_time_minutes && <span>⏱ {r.prep_time_minutes}m</span>}
                            {r.cook_time_minutes && <span>🍳 {r.cook_time_minutes}m</span>}
                            {r.servings && <span>🍽 {r.servings} p.</span>}
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
                            <span className="modal-title">Recetas sugeridas</span>
                        </div>
                        <div style={{ padding: '0 16px 16px', maxHeight: '70vh', overflowY: 'auto' }}>
                            <p style={{ marginBottom: 16 }}>{voiceMessage}</p>
                            <div style={{ display: 'grid', gap: 16 }}>
                                {suggestedRecipes.map((r, idx) => (
                                    <div key={idx} style={{ background: 'var(--bg-secondary)', padding: "12px", borderRadius: 8 }}>
                                        <h3 style={{ margin: '0 0 8px 0' }}>{r.name}</h3>
                                        <div style={{ fontSize: 13, marginBottom: 8 }}>⏱ {r.time}</div>
                                        <div style={{ fontSize: 13, marginBottom: 8 }}><strong>Ingredientes:</strong> {r.ingredients.join(', ')}</div>
                                        <p style={{ fontSize: 14, margin: '0 0 12px 0', lineHeight: 1.4 }}>{r.instructions}</p>
                                        <button className="btn btn-secondary btn-sm" onClick={async () => {
                                            if (confirm(`¿Añadir receta "${r.name}" a tus recetas?`)) {
                                                try {
                                                    await api.recipes.save({
                                                        title: r.name,
                                                        description: r.instructions,
                                                        prepTimeMinutes: parseInt(r.time) || 15,
                                                        instructions: [r.instructions],
                                                        ingredients: r.ingredients.map((i: string) => ({ name: i, originalText: i }))
                                                    });
                                                    alert('Receta guardada.');
                                                    load();
                                                } catch(e) {
                                                    alert('Error guardando receta');
                                                }
                                            }
                                        }}>
                                            Guardar receta
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Voice Button */}
            <button 
                className="btn btn-primary" 
                style={{ 
                    position: 'fixed', bottom: 20, right: 20, borderRadius: '50%', width: 60, height: 60,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, zIndex: 100,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    background: isListening ? '#f44336' : isProcessing ? '#ff9800' : 'var(--primary)',
                    animation: isListening || isProcessing ? 'pulse 2s infinite' : 'none',
                    border: 'none', color: '#fff', cursor: 'pointer'
                }}
                onClick={() => {
                    if (isListening) {
                        stopListening();
                    } else {
                        startListening(async (finalText) => {
                            try {
                                const res = await api.voice.processRecipes(finalText);
                                if (res.recipes && res.recipes.length) {
                                    setSuggestedRecipes(res.recipes);
                                    setVoiceMessage(res.message || 'Recetas encontradas:');
                                } else {
                                    alert('No se detectaron recetas.');
                                }
                            } catch (err: any) {
                                alert(err.message || 'Error procesando voz');
                            }
                        });
                    }
                }}
            >
                {isProcessing ? '⏳' : isListening ? '⏹' : '🎤'}
            </button>
            
            {/* Voice Status Overlay */}
            {(isListening || isProcessing) && (
                <div style={{
                    position: 'fixed', bottom: 90, right: 20, background: 'var(--bg-card)', 
                    padding: '12px 16px', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 100, maxWidth: 300, border: '1px solid var(--border)'
                }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {isProcessing ? 'Procesando con IA...' : 'Pensando opciones...'}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                        {transcript || 'Di algo como: "Tengo pollo y arroz, ¿qué cocino?"'}
                    </div>
                </div>
            )}
            {voiceError && (
                <div style={{
                    position: 'fixed', top: 20, right: 20, background: '#f44336', color: '#fff',
                    padding: '12px 16px', borderRadius: 8, zIndex: 1000, boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}>
                    {voiceError}
                </div>
            )}
            
            {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem 0', color: '#888' }}>
                    {t('recipes.noRecipes')}
                </div>
            )}
        </div>
    );
}

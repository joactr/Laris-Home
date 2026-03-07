import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { t } from '../../i18n';

export default function Recipes() {
    const navigate = useNavigate();
    const [recipes, setRecipes] = useState<any[]>([]);
    const [search, setSearch] = useState('');

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
            
            {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem 0', color: '#888' }}>
                    {t('recipes.noRecipes')}
                </div>
            )}
        </div>
    );
}

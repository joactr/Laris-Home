import { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { es } from 'date-fns/locale';
import { t } from '../../i18n';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export default function Meals() {
    const navigate = useNavigate();
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [mealMap, setMealMap] = useState<Record<string, any>>({});
    const [editing, setEditing] = useState<{ date: string; field: string } | null>(null);
    const [editVal, setEditVal] = useState('');
    const [showShoppingModal, setShowShoppingModal] = useState<{ date: string; meal: string } | null>(null);
    const [ingredientText, setIngredientText] = useState('');
    const [lists, setLists] = useState<any[]>([]);
    const [recipes, setRecipes] = useState<any[]>([]);
    const [selectedList, setSelectedList] = useState('');

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekEnd = addDays(weekStart, 6);

    const load = async () => {
        const [data, ls, recs] = await Promise.all([
            api.meals.getWeek(format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')),
            api.shopping.getLists(),
            api.recipes.getAll(),
        ]);
        const map: Record<string, any> = {};
        data.forEach(d => { map[d.date.slice(0, 10)] = d; });
        setMealMap(map);
        setLists(ls);
        setRecipes(recs);
        if (!selectedList && ls.length) setSelectedList(ls[0].id);
    };

    useEffect(() => { load(); }, [weekStart]);

    const startEdit = (date: string, field: string, val: string) => {
        setEditing({ date, field });
        setEditVal(val || '');
    };

    const saveEdit = async () => {
        if (!editing) return;
        const existing = mealMap[editing.date] || {};
        const updateObj = { ...existing, [editing.field]: editVal };
        // If the text was changed manually, clear the recipe link
        const currentRefTitle = existing[`${editing.field}_recipe_title`] || existing[editing.field];
        if (editVal !== currentRefTitle) {
            updateObj[`${editing.field}_recipe_id`] = null;
        }
        await api.meals.updateDay(editing.date, updateObj);
        setEditing(null);
        load();
    };

    const addToShopping = async () => {
        if (!showShoppingModal || !selectedList) return;
        await api.meals.addToShopping(showShoppingModal.date, selectedList, ingredientText);
        setShowShoppingModal(null);
        setIngredientText('');
    };

    return (
        <div className="page full-width">
            <div className="page-header">
                <div>
                    <div className="page-title">{t('page.meals')}</div>
                    <div className="page-subtitle">{format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d')}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn-icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>←</button>
                    <button className="btn-icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>→</button>
                </div>
            </div>

            <div className="meal-week-grid">
                {weekDays.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const meal = mealMap[dateStr] || {};
                    const totalMacros = MEAL_TYPES.reduce((acc, type) => {
                        acc.calories += Number(meal[`${type}_calories`]) || 0;
                        acc.protein += Number(meal[`${type}_protein`]) || 0;
                        acc.carbs += Number(meal[`${type}_carbs`]) || 0;
                        acc.fat += Number(meal[`${type}_fat`]) || 0;
                        return acc;
                    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
                    const hasMacros = totalMacros.calories > 0 || totalMacros.protein > 0 || totalMacros.carbs > 0 || totalMacros.fat > 0;

                    return (
                        <div key={dateStr} className={`meal-day-card ${isSameDay(day, new Date()) ? 'today-highlight' : ''}`}>
                            <div className="meal-day-title" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                                <span style={{ textTransform: 'capitalize' }}>{format(day, 'EEE d', { weekStartsOn: 1, locale: es })}</span>
                                {hasMacros && (
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {totalMacros.calories > 0 && <span style={{ fontSize: 10, background: 'rgba(33,150,243,0.15)', color: '#90caf9', border: '1px solid rgba(33,150,243,0.3)', padding: '2px 6px', borderRadius: 6 }}><strong>{Math.round(totalMacros.calories)}</strong> kcal</span>}
                                        {totalMacros.carbs > 0 && <span style={{ fontSize: 10, background: 'rgba(76,175,80,0.15)', color: '#a5d6a7', border: '1px solid rgba(76,175,80,0.3)', padding: '2px 6px', borderRadius: 6 }}><strong>{Math.round(totalMacros.carbs)}g</strong> C</span>}
                                        {totalMacros.fat > 0 && <span style={{ fontSize: 10, background: 'rgba(156,39,176,0.15)', color: '#ce93d8', border: '1px solid rgba(156,39,176,0.3)', padding: '2px 6px', borderRadius: 6 }}><strong>{Math.round(totalMacros.fat)}g</strong> G</span>}
                                        {totalMacros.protein > 0 && <span style={{ fontSize: 10, background: 'rgba(255,193,7,0.15)', color: '#ffe082', border: '1px solid rgba(255,193,7,0.3)', padding: '2px 6px', borderRadius: 6 }}><strong>{Math.round(totalMacros.protein)}g</strong> P</span>}
                                    </div>
                                )}
                            </div>
                            {MEAL_TYPES.map(type => (
                                <div key={type} className="meal-slot">
                                    <div className="meal-slot-label">{type === 'breakfast' ? 'desayuno' : type === 'lunch' ? 'almuerzo' : type === 'dinner' ? 'cena' : 'merienda'}</div>
                                    {editing?.date === dateStr && editing?.field === type ? (
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                className="input"
                                                style={{ fontSize: 12, padding: '4px 6px' }}
                                                autoFocus
                                                placeholder="Escribe o busca receta..."
                                                value={editVal}
                                                onChange={e => setEditVal(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null); }}
                                            />
                                            {/* Recipe suggestions dropdown */}
                                            {editVal.trim().length > 0 && recipes.filter(r => r.title.toLowerCase().includes(editVal.toLowerCase())).length > 0 && (
                                                <div style={{
                                                    position: 'absolute', top: '100%', left: 0, right: 0,
                                                    background: 'var(--bg4)', border: '1px solid var(--border)',
                                                    borderRadius: 'var(--radius-sm)', zIndex: 50,
                                                    maxHeight: 160, overflowY: 'auto',
                                                    boxShadow: 'var(--shadow)',
                                                }}>
                                                    {recipes
                                                        .filter(r => r.title.toLowerCase().includes(editVal.toLowerCase()))
                                                        .map(r => (
                                                            <div
                                                                key={r.id}
                                                                style={{
                                                                    padding: '7px 10px', fontSize: 12, cursor: 'pointer',
                                                                    borderBottom: '1px solid var(--border)',
                                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                                }}
                                                                onMouseDown={async (e) => {
                                                                    e.preventDefault(); // prevent blur
                                                                    const existing = mealMap[dateStr] || {};
                                                                    await api.meals.updateDay(dateStr, {
                                                                        ...existing,
                                                                        [type]: r.title,
                                                                        [`${type}_recipe_id`]: r.id,
                                                                    });
                                                                    setEditing(null);
                                                                    load();
                                                                }}
                                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
                                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                            >
                                                                <span>📖</span>
                                                                <span>{r.title}</span>
                                                            </div>
                                                        ))}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                                <button className="btn btn-primary btn-sm" style={{ flex: 1, fontSize: 11 }} onClick={saveEdit}>OK</button>
                                                <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => setEditing(null)}>✕</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className={`meal-slot-value ${!meal[type] && !meal[`${type}_recipe_id`] ? 'empty' : ''}`}
                                            onClick={() => startEdit(dateStr, type, meal[`${type}_recipe_title`] || meal[type])}
                                            title={t('common.edit')}
                                            style={{ cursor: 'pointer', minHeight: 20 }}
                                        >
                                            {meal[`${type}_recipe_title`] ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <span style={{ color: 'var(--accent2)', fontWeight: 'bold', fontSize: 12 }}>
                                                        📖 {meal[`${type}_recipe_title`]}
                                                    </span>
                                                    {(Number(meal[`${type}_calories`]) > 0 || Number(meal[`${type}_protein`]) > 0) && (
                                                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                                            {Number(meal[`${type}_calories`]) > 0 && <span style={{ fontSize: 9, background: 'rgba(33,150,243,0.15)', color: '#90caf9', border: '1px solid rgba(33,150,243,0.3)', padding: '1px 5px', borderRadius: 5 }}>{Math.round(Number(meal[`${type}_calories`]))} kcal</span>}
                                                            {Number(meal[`${type}_carbs`]) > 0 && <span style={{ fontSize: 9, background: 'rgba(76,175,80,0.15)', color: '#a5d6a7', border: '1px solid rgba(76,175,80,0.3)', padding: '1px 5px', borderRadius: 5 }}>{Math.round(Number(meal[`${type}_carbs`]))}g C</span>}
                                                            {Number(meal[`${type}_fat`]) > 0 && <span style={{ fontSize: 9, background: 'rgba(156,39,176,0.15)', color: '#ce93d8', border: '1px solid rgba(156,39,176,0.3)', padding: '1px 5px', borderRadius: 5 }}>{Math.round(Number(meal[`${type}_fat`]))}g G</span>}
                                                            {Number(meal[`${type}_protein`]) > 0 && <span style={{ fontSize: 9, background: 'rgba(255,193,7,0.15)', color: '#ffe082', border: '1px solid rgba(255,193,7,0.3)', padding: '1px 5px', borderRadius: 5 }}>{Math.round(Number(meal[`${type}_protein`]))}g P</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (meal[type] || t('common.add'))}
                                        </div>
                                    )}
                                </div>
                            ))}
                            <button
                                className="btn btn-ghost btn-sm"
                                style={{ width: '100%', marginTop: 6, fontSize: 11 }}
                                onClick={() => { setShowShoppingModal({ date: dateStr, meal: '' }); setIngredientText(''); }}
                            >
                                🛒 {t('recipes.addToShoppingList')}
                            </button>
                        </div>
                    );
                })}
            </div>


            {showShoppingModal && (
                <div className="modal-overlay" onClick={() => setShowShoppingModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                            <span className="modal-title">{t('recipes.addToShoppingList')}</span>
                            <button className="modal-close" onClick={() => setShowShoppingModal(null)}>×</button>
                        </div>
                        <div className="form-group">
                            <label className="label">{t('page.shopping')}</label>
                            <select className="input" value={selectedList} onChange={e => setSelectedList(e.target.value)}>
                                {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="label">{t('recipes.ingredients')} (uno por línea)</label>
                            <textarea
                                className="input"
                                placeholder={"Pasta\nTomate\nQueso"}
                                value={ingredientText}
                                onChange={e => setIngredientText(e.target.value)}
                                style={{ minHeight: 120 }}
                            />
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowShoppingModal(null)}>{t('common.cancel')}</button>
                            <button className="btn btn-primary" onClick={addToShopping}>{t('common.add')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

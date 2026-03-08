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
                    <div className="page-subtitle" style={{ textTransform: 'capitalize' }}>
                        {format(weekStart, 'MMM d', { locale: es })} – {format(weekEnd, 'MMM d', { locale: es })}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn-icon touch-target" onClick={() => setWeekStart(subWeeks(weekStart, 1))} aria-label={t('common.prev')}>←</button>
                    <button className="btn-icon touch-target" onClick={() => setWeekStart(addWeeks(weekStart, 1))} aria-label={t('common.next')}>→</button>
                </div>
            </div>

            <div className="meal-week-grid h-scroll-wrapper">
                <div className="h-scroll-container">
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
                                <div className="meal-day-header">
                                    <div className="meal-day-title" style={{ textTransform: 'capitalize' }}>
                                        {format(day, 'EEE d', { weekStartsOn: 1, locale: es })}
                                    </div>
                                    {hasMacros && (
                                        <div className="meal-day-macros">
                                            {totalMacros.calories > 0 && <span className="macro-badge calories"><strong>{Math.round(totalMacros.calories)}</strong> kcal</span>}
                                            {totalMacros.carbs > 0 && <span className="macro-badge carbs"><strong>{Math.round(totalMacros.carbs)}g</strong> C</span>}
                                            {totalMacros.fat > 0 && <span className="macro-badge fat"><strong>{Math.round(totalMacros.fat)}g</strong> G</span>}
                                            {totalMacros.protein > 0 && <span className="macro-badge protein"><strong>{Math.round(totalMacros.protein)}g</strong> P</span>}
                                        </div>
                                    )}
                                </div>
                                {MEAL_TYPES.map(type => (
                                    <div key={type} className="meal-slot">
                                        <div className="meal-slot-label">{t(`meals.${type}`)}</div>
                                        {editing?.date === dateStr && editing?.field === type ? (
                                            <div className="meal-edit-container">
                                                <input
                                                    className="input meal-input"
                                                    autoFocus
                                                    placeholder={t('common.search')}
                                                    value={editVal}
                                                    onChange={e => setEditVal(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null); }}
                                                />
                                                {/* Recipe suggestions dropdown */}
                                                {editVal.trim().length > 0 && recipes.filter(r => r.title.toLowerCase().includes(editVal.toLowerCase())).length > 0 && (
                                                    <div className="meal-suggestions">
                                                        {recipes
                                                            .filter(r => r.title.toLowerCase().includes(editVal.toLowerCase()))
                                                            .map(r => (
                                                                <div
                                                                    key={r.id}
                                                                    className="suggestion-item"
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
                                                                >
                                                                    <span>📖</span>
                                                                    <span>{r.title}</span>
                                                                </div>
                                                            ))}
                                                    </div>
                                                )}
                                                <div className="meal-edit-actions">
                                                    <button className="btn btn-primary btn-xs touch-target" onClick={saveEdit}>OK</button>
                                                    <button className="btn btn-secondary btn-xs touch-target" onClick={() => setEditing(null)}>✕</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                className={`meal-slot-value touch-target ${!meal[type] && !meal[`${type}_recipe_id`] ? 'empty' : ''}`}
                                                onClick={() => startEdit(dateStr, type, meal[`${type}_recipe_title`] || meal[type])}
                                                title={t('common.edit')}
                                            >
                                                {meal[`${type}_recipe_title`] ? (
                                                    <div className="meal-recipe-link">
                                                        <span className="recipe-title">📖 {meal[`${type}_recipe_title`]}</span>
                                                        {(Number(meal[`${type}_calories`]) > 0 || Number(meal[`${type}_protein`]) > 0) && (
                                                            <div className="meal-slot-macros">
                                                                {Number(meal[`${type}_calories`]) > 0 && <span className="macro-badge-sm calories">{Math.round(Number(meal[`${type}_calories`]))}</span>}
                                                                {Number(meal[`${type}_carbs`]) > 0 && <span className="macro-badge-sm carbs">{Math.round(Number(meal[`${type}_carbs`]))}</span>}
                                                                {Number(meal[`${type}_fat`]) > 0 && <span className="macro-badge-sm fat">{Math.round(Number(meal[`${type}_fat`]))}</span>}
                                                                {Number(meal[`${type}_protein`]) > 0 && <span className="macro-badge-sm protein">{Math.round(Number(meal[`${type}_protein`]))}</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (meal[type] || t('common.add'))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <button
                                    className="btn btn-ghost btn-sm touch-target"
                                    style={{ width: '100%', marginTop: 8 }}
                                    onClick={() => { setShowShoppingModal({ date: dateStr, meal: '' }); setIngredientText(''); }}
                                >
                                    🛒 {t('recipes.addToShoppingList')}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>


            {showShoppingModal && (
                <div className="modal-overlay" onClick={() => setShowShoppingModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">{t('recipes.addToShoppingList')}</span>
                            <button className="modal-close touch-target" onClick={() => setShowShoppingModal(null)} aria-label={t('common.close')}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="label" htmlFor="list-select">{t('page.shopping')}</label>
                                <select id="list-select" className="input" value={selectedList} onChange={e => setSelectedList(e.target.value)}>
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

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
    // Map maps date string to array of items
    const [mealMap, setMealMap] = useState<Record<string, any[]>>({});
    
    // editingNew maps date->meal_type to boolean representing if we are adding a new item
    const [editingNew, setEditingNew] = useState<{ date: string; type: string } | null>(null);
    const [editVal, setEditVal] = useState('');
    
    // editingServings maps item_id to true
    const [editingItem, setEditingItem] = useState<{ id: string; field: 'servings'|'text', val: string|number } | null>(null);

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
        const map: Record<string, any[]> = {};
        data.forEach(d => { map[d.date.slice(0, 10)] = d.items || []; });
        setMealMap(map);
        setLists(ls);
        setRecipes(recs);
        if (!selectedList && ls.length) setSelectedList(ls[0].id);
    };

    useEffect(() => { load(); }, [weekStart]);

    // Scroll to today on mobile
    useEffect(() => {
        const timer = setTimeout(() => {
            const todayEl = document.querySelector('.today-highlight');
            if (todayEl) {
                todayEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [weekStart, mealMap]);

    const startAddNew = (date: string, type: string) => {
        setEditingNew({ date, type });
        setEditVal('');
    };

    const saveNewItem = async (recipeId: string | null = null, titleOverride: string | null = null) => {
        if (!editingNew) return;
        const textToSave = titleOverride || editVal.trim();
        if (!textToSave && !recipeId) {
            setEditingNew(null);
            return;
        }
        await api.meals.addItem(editingNew.date, {
            meal_type: editingNew.type,
            recipe_id: recipeId,
            text_content: textToSave,
            servings: 1
        });
        setEditingNew(null);
        setEditVal('');
        load();
    };

    const saveItemUpdate = async () => {
        if (!editingItem) return;
        await api.meals.updateItem(editingItem.id, {
            [editingItem.field === 'servings' ? 'servings' : 'text_content']: editingItem.val
        });
        setEditingItem(null);
        load();
    };

    const deleteItem = async (id: string) => {
        await api.meals.deleteItem(id);
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
                        const dayItems = mealMap[dateStr] || [];
                        
                        const totalMacros = dayItems.reduce((acc, item) => {
                            const serv = Number(item.servings) || 1;
                            acc.calories += (Number(item.calories_per_serving) || 0) * serv;
                            acc.protein += (Number(item.protein_per_serving) || 0) * serv;
                            acc.carbs += (Number(item.carbs_per_serving) || 0) * serv;
                            acc.fat += (Number(item.fat_per_serving) || 0) * serv;
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
                                {MEAL_TYPES.map(type => {
                                    const typeItems = dayItems.filter(i => i.meal_type === type);
                                    
                                    return (
                                        <div key={type} className="meal-slot" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div className="meal-slot-label" style={{ marginBottom: 0 }}>{t(`meals.${type}`)}</div>
                                            
                                            {/* Render Items */}
                                            {typeItems.map(item => (
                                                <div key={item.id} className="meal-item-chip" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: '13px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                                        <div style={{ flex: 1, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            {item.recipe_id && <span>📖</span>}
                                                            <span 
                                                                style={{ cursor: 'pointer' }}
                                                                onClick={() => setEditingItem({ id: item.id, field: 'text', val: item.text_content || item.recipe_title || '' })}
                                                            >
                                                                {item.recipe_title || item.text_content}
                                                            </span>
                                                        </div>
                                                        <button 
                                                            className="btn-icon" 
                                                            style={{ padding: '2px', width: 'auto', height: 'auto', background: 'none' }}
                                                            onClick={() => deleteItem(item.id)}
                                                        >✕</button>
                                                    </div>
                                                    
                                                    {editingItem?.id === item.id && editingItem?.field === 'text' ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                                                            <input 
                                                                autoFocus
                                                                className="input" 
                                                                style={{ padding: '2px 6px', minHeight: '24px', fontSize: '12px' }}
                                                                value={editingItem!.val} 
                                                                onChange={e => setEditingItem({ ...editingItem!, val: e.target.value })}
                                                                onKeyDown={e => { if (e.key === 'Enter') saveItemUpdate(); if (e.key === 'Escape') setEditingItem(null); }}
                                                                onBlur={saveItemUpdate}
                                                            />
                                                        </div>
                                                    ) : null}

                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        {/* Servings control */}
                                                        {editingItem?.id === item.id && editingItem?.field === 'servings' ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <input 
                                                                    type="number" 
                                                                    autoFocus
                                                                    className="input" 
                                                                    style={{ width: '50px', padding: '2px 4px', minHeight: '24px', fontSize: '12px' }}
                                                                    value={editingItem!.val} 
                                                                    onChange={e => setEditingItem({ ...editingItem!, val: Number(e.target.value) })}
                                                                    onKeyDown={e => { if (e.key === 'Enter') saveItemUpdate(); if (e.key === 'Escape') setEditingItem(null); }}
                                                                    onBlur={saveItemUpdate}
                                                                    step="0.1" min="0.1"
                                                                />
                                                                <span>porciones</span>
                                                            </div>
                                                        ) : (
                                                            <div 
                                                                style={{ cursor: 'pointer', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}
                                                                onClick={() => setEditingItem({ id: item.id, field: 'servings', val: Number(item.servings) || 1 })}
                                                            >
                                                                {Number(item.servings) || 1} {Number(item.servings) === 1 ? 'porción' : 'porciones'} ✎
                                                            </div>
                                                        )}

                                                        {/* Item Macros */}
                                                        {item.calories_per_serving > 0 && (
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <span className="macro-badge-sm calories">{Math.round(item.calories_per_serving * (Number(item.servings) || 1))} kcal</span>
                                                                {item.protein_per_serving > 0 && <span className="macro-badge-sm protein">{Math.round(item.protein_per_serving * (Number(item.servings) || 1))}g</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Add New Item Input */}
                                            {editingNew?.date === dateStr && editingNew?.type === type ? (
                                                <div className="meal-edit-container" style={{ marginTop: '4px' }}>
                                                    <input
                                                        className="input meal-input"
                                                        style={{ padding: '6px', minHeight: '30px' }}
                                                        autoFocus
                                                        placeholder={t('common.search')}
                                                        value={editVal}
                                                        onChange={e => setEditVal(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter') saveNewItem(); if (e.key === 'Escape') setEditingNew(null); }}
                                                    />
                                                    {/* Recipe suggestions dropdown */}
                                                    {editVal.trim().length > 0 && (
                                                        <div className="meal-suggestions">
                                                            {recipes
                                                                .filter(r => r.title.toLowerCase().includes(editVal.toLowerCase()))
                                                                .slice(0, 5)
                                                                .map(r => (
                                                                    <div
                                                                        key={r.id}
                                                                        className="suggestion-item"
                                                                        onMouseDown={(e) => {
                                                                            e.preventDefault(); // prevent blur
                                                                            saveNewItem(r.id, r.title);
                                                                        }}
                                                                    >
                                                                        <div className="suggestion-img">
                                                                            {r.image_url ? (
                                                                                <img src={r.image_url} alt="" />
                                                                            ) : (
                                                                                "📖"
                                                                            )}
                                                                        </div>
                                                                        <div className="suggestion-info">
                                                                            <span className="suggestion-title">{r.title}</span>
                                                                            <div className="suggestion-meta">
                                                                                {r.prep_time_minutes > 0 && (
                                                                                    <span>🕒 {r.prep_time_minutes + (r.cook_time_minutes || 0)} min</span>
                                                                                )}
                                                                                {r.calories_per_serving > 0 && (
                                                                                    <span>🔥 {Math.round(r.calories_per_serving)} kcal</span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <button 
                                                    className="btn btn-ghost btn-sm" 
                                                    style={{ justifyContent: 'center', opacity: 0.7, minHeight: '28px', padding: '4px' }}
                                                    onClick={() => startAddNew(dateStr, type)}
                                                >
                                                    + AÑADIR
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
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

import { useEffect, useMemo, useState } from 'react';
import { addDays, addWeeks, format, isSameDay, startOfWeek, subWeeks } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { t } from '../../i18n';
import { useOfflineStore } from '../../store/offline';
import { toastError, toastInfo, toastSuccess } from '../../store/toast';
import CollapsiblePanel from '../../components/CollapsiblePanel';
import StatusModal from '../../components/StatusModal';
import SectionHeader from '../../components/SectionHeader';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export default function Meals() {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [mealMap, setMealMap] = useState<Record<string, any[]>>({});
  const [editingNew, setEditingNew] = useState<{ date: string; type: string } | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editingItem, setEditingItem] = useState<{ id: string; field: 'servings' | 'text'; val: string | number } | null>(null);
  const [showShoppingModal, setShowShoppingModal] = useState<{ date: string; meal: string } | null>(null);
  const [ingredientText, setIngredientText] = useState('');
  const [lists, setLists] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [selectedList, setSelectedList] = useState('');
  const [showWeekShoppingModal, setShowWeekShoppingModal] = useState(false);
  const [weekShoppingPreview, setWeekShoppingPreview] = useState({ recipeMealCount: 0, skippedTextMealsCount: 0 });
  const [weekShoppingResult, setWeekShoppingResult] = useState<{ addedCount: number; skippedTextMealsCount: number } | null>(null);
  const [weekShoppingError, setWeekShoppingError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const isOffline = useOfflineStore((s) => s.isOffline);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekEnd = addDays(weekStart, 6);

  const load = async () => {
    const [data, nextLists, nextRecipes] = await Promise.all([
      api.meals.getWeek(format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')),
      api.shopping.getLists(),
      api.recipes.getAll(),
    ]);
    const nextMap: Record<string, any[]> = {};
    data.forEach((day) => {
      nextMap[day.date.slice(0, 10)] = day.items || [];
    });
    setMealMap(nextMap);
    setLists(nextLists);
    setRecipes(nextRecipes);
    if (!selectedList && nextLists.length) {
      setSelectedList(nextLists[0].id);
    }
  };

  useEffect(() => {
    void load();
  }, [weekStart]);

  useEffect(() => {
    setOpenDay((current) => {
      if (current && weekDays.some((day) => format(day, 'yyyy-MM-dd') === current)) {
        return current;
      }
      return getPreferredOpenDay(weekDays, mealMap);
    });
  }, [mealMap, weekDays]);

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
    try {
      const created = await api.meals.addItem(editingNew.date, {
        meal_type: editingNew.type,
        recipe_id: recipeId,
        text_content: textToSave,
        servings: 1,
      });
      setEditingNew(null);
      setEditVal('');
      await load();
      if (created.pending_sync) {
        toastInfo('Comida guardada sin conexión', 'Se sincronizará cuando vuelva la red.');
      } else {
        toastSuccess('Comida añadida');
      }
    } catch (err: any) {
      toastError('No se pudo añadir la comida', err?.message || t('common.error'));
    }
  };

  const saveItemUpdate = async () => {
    if (!editingItem) return;
    try {
      const updated = await api.meals.updateItem(editingItem.id, {
        [editingItem.field === 'servings' ? 'servings' : 'text_content']: editingItem.val,
      });
      setEditingItem(null);
      await load();
      if (updated.pending_sync) {
        toastInfo('Cambio guardado sin conexión', 'Se sincronizará después.');
      } else {
        toastSuccess('Comida actualizada');
      }
    } catch (err: any) {
      toastError('No se pudo actualizar la comida', err?.message || t('common.error'));
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await api.meals.deleteItem(id);
      await load();
      toastSuccess('Comida eliminada');
    } catch (err: any) {
      toastError('No se pudo eliminar la comida', err?.message || t('common.error'));
    }
  };

  const addToShopping = async () => {
    if (!showShoppingModal || !selectedList) return;
    try {
      await api.meals.addToShopping(showShoppingModal.date, selectedList, ingredientText);
      setShowShoppingModal(null);
      setIngredientText('');
      toastSuccess('Ingredientes añadidos', 'La lista de compra se ha actualizado.');
    } catch (err: any) {
      toastError('No se pudieron añadir los ingredientes', err?.message || t('common.error'));
    }
  };

  const openWeekShoppingModal = () => {
    const summary = Object.values(mealMap).flat().reduce(
      (acc, item: any) => {
        if (item.recipe_id) acc.recipeMealCount += 1;
        else acc.skippedTextMealsCount += 1;
        return acc;
      },
      { recipeMealCount: 0, skippedTextMealsCount: 0 }
    );
    setWeekShoppingPreview(summary);
    setShowWeekShoppingModal(true);
  };

  const generateWeekShopping = async () => {
    try {
      const result = await api.meals.generateShoppingFromRange(
        format(weekStart, 'yyyy-MM-dd'),
        format(weekEnd, 'yyyy-MM-dd'),
        selectedList
      );
      setShowWeekShoppingModal(false);
      setWeekShoppingResult({
        addedCount: result.addedCount,
        skippedTextMealsCount: result.skippedTextMealsCount,
      });
      toastSuccess('Lista de compra generada', `Se añadieron ${result.addedCount} ingrediente${result.addedCount === 1 ? '' : 's'}.`);
    } catch (err: any) {
      setWeekShoppingError(err.message || t('common.error'));
      toastError('No se pudo generar la compra semanal', err?.message || t('common.error'));
    }
  };

  return (
    <div className="page page-meals">
      <SectionHeader
        eyebrow="Plan semanal"
        title={t('page.meals')}
        subtitle={`${format(weekStart, 'MMM d', { locale: es })} - ${format(weekEnd, 'MMM d, yyyy', { locale: es })}`}
        actions={
          <div className="header-action-row">
            <div className="week-switcher">
              <button type="button" className="btn btn-secondary" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
                {t('common.prev')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
                {t('common.next')}
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={openWeekShoppingModal}
              disabled={isOffline || !selectedList}
            >
              {t('meals.generateWeekShopping')}
            </button>
          </div>
        }
      />

      <div className="planner-stack">
        {weekDays.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayItems = mealMap[dateStr] || [];
          const totalMacros = dayItems.reduce(
            (acc: any, item: any) => {
              const servings = Number(item.servings) || 1;
              acc.calories += (Number(item.calories_per_serving) || 0) * servings;
              acc.protein += (Number(item.protein_per_serving) || 0) * servings;
              acc.carbs += (Number(item.carbs_per_serving) || 0) * servings;
              acc.fat += (Number(item.fat_per_serving) || 0) * servings;
              return acc;
            },
            { calories: 0, protein: 0, carbs: 0, fat: 0 }
          );

          return (
            <CollapsiblePanel
              key={dateStr}
              id={`meal-day-${dateStr}`}
              className={`planner-day ${isSameDay(day, new Date()) ? 'today' : ''}`}
              title={format(day, "EEEE d 'de' MMMM", { locale: es })}
              subtitle={dayItems.length ? `${dayItems.length} comidas planificadas` : 'Sin plan para este día'}
              summary={<MealDaySummary dayItems={dayItems} totalMacros={totalMacros} isToday={isSameDay(day, new Date())} />}
              open={openDay === dateStr}
              onToggle={() => setOpenDay((current) => (current === dateStr ? null : dateStr))}
            >
              <div className="meal-slot-grid">
                {MEAL_TYPES.map((type) => {
                  const typeItems = dayItems.filter((item) => item.meal_type === type);
                  const isEditingHere = editingNew?.date === dateStr && editingNew?.type === type;

                  return (
                    <div key={type} className="meal-slot-card">
                      <div className="meal-slot-card-header">
                        <span>{t(`meals.${type}`)}</span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => startAddNew(dateStr, type)}>
                          + Añadir
                        </button>
                      </div>

                      {typeItems.length ? (
                        <div className="meal-item-list">
                          {typeItems.map((item) => {
                            const textEditorActive = editingItem?.id === item.id && editingItem?.field === 'text';
                            const servingsEditorActive = editingItem?.id === item.id && editingItem?.field === 'servings';

                            return (
                              <div key={item.id} className="meal-item-row">
                                <div className="meal-item-main">
                                  {textEditorActive ? (
                                    <input
                                      autoFocus
                                      className="input"
                                      value={String(editingItem?.val ?? '')}
                                      onChange={(e) =>
                                        setEditingItem((current) => (current ? { ...current, val: e.target.value } : current))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') void saveItemUpdate();
                                        if (e.key === 'Escape') setEditingItem(null);
                                      }}
                                      onBlur={() => void saveItemUpdate()}
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      className="meal-item-title"
                                      onClick={() =>
                                        setEditingItem({
                                          id: item.id,
                                          field: 'text',
                                          val: item.text_content || item.recipe_title || '',
                                        })
                                      }
                                    >
                                      {item.recipe_id ? '📖 ' : ''}
                                      {item.recipe_title || item.text_content}
                                    </button>
                                  )}

                                  <div className="meal-item-meta">
                                    {servingsEditorActive ? (
                                      <input
                                        type="number"
                                        autoFocus
                                        className="input meal-servings-input"
                                        value={Number(editingItem?.val ?? 1)}
                                        onChange={(e) =>
                                          setEditingItem((current) => (current ? { ...current, val: Number(e.target.value) } : current))
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') void saveItemUpdate();
                                          if (e.key === 'Escape') setEditingItem(null);
                                        }}
                                        onBlur={() => void saveItemUpdate()}
                                        step="0.1"
                                        min="0.1"
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        className="subtle-link"
                                        onClick={() =>
                                          setEditingItem({
                                            id: item.id,
                                            field: 'servings',
                                            val: Number(item.servings) || 1,
                                          })
                                        }
                                      >
                                        {Number(item.servings) || 1} porción{Number(item.servings) === 1 ? '' : 'es'}
                                      </button>
                                    )}

                                    <div className="planner-macros">
                                      {item.calories_per_serving > 0 ? (
                                        <span className="macro-badge-sm calories">
                                          {Math.round(item.calories_per_serving * (Number(item.servings) || 1))} kcal
                                        </span>
                                      ) : null}
                                      {item.protein_per_serving > 0 ? (
                                        <span className="macro-badge-sm protein">
                                          {Math.round(item.protein_per_serving * (Number(item.servings) || 1))}g
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void deleteItem(item.id)}>
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty-state compact left">Sin comida definida todavía.</div>
                      )}

                      {isEditingHere ? (
                        <div className="meal-edit-container">
                          <input
                            className="input"
                            autoFocus
                            placeholder={t('common.search')}
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveNewItem();
                              if (e.key === 'Escape') setEditingNew(null);
                            }}
                          />
                          {editVal.trim().length > 0 ? (
                            <div className="meal-suggestions">
                              {recipes
                                .filter((recipe) => recipe.title.toLowerCase().includes(editVal.toLowerCase()))
                                .slice(0, 5)
                                .map((recipe) => (
                                  <button
                                    key={recipe.id}
                                    type="button"
                                    className="suggestion-item"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      void saveNewItem(recipe.id, recipe.title);
                                    }}
                                  >
                                    <div className="suggestion-img">
                                      {recipe.image_url ? <img src={recipe.image_url} alt="" /> : '📖'}
                                    </div>
                                    <div className="suggestion-info">
                                      <span className="suggestion-title">{recipe.title}</span>
                                      <div className="suggestion-meta">
                                        {recipe.prep_time_minutes > 0 ? <span>{recipe.prep_time_minutes + (recipe.cook_time_minutes || 0)} min</span> : null}
                                        {recipe.calories_per_serving > 0 ? <span>{Math.round(recipe.calories_per_serving)} kcal</span> : null}
                                      </div>
                                    </div>
                                  </button>
                                ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="planner-day-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowShoppingModal({ date: dateStr, meal: '' });
                    setIngredientText('');
                  }}
                >
                  {t('recipes.addToShoppingList')}
                </button>
              </div>
            </CollapsiblePanel>
          );
        })}
      </div>

      {showShoppingModal ? (
        <div className="modal-overlay" onClick={() => setShowShoppingModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('recipes.addToShoppingList')}</span>
              <button className="modal-close touch-target" onClick={() => setShowShoppingModal(null)} aria-label={t('common.close')}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label" htmlFor="list-select">
                  {t('page.shopping')}
                </label>
                <select id="list-select" className="input" value={selectedList} onChange={(e) => setSelectedList(e.target.value)}>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="label">{t('recipes.ingredients')} (uno por línea)</label>
                <textarea
                  className="input"
                  placeholder={'Pasta\nTomate\nQueso'}
                  value={ingredientText}
                  onChange={(e) => setIngredientText(e.target.value)}
                  style={{ minHeight: 120 }}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowShoppingModal(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={() => void addToShopping()}>
                {t('common.add')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showWeekShoppingModal ? (
        <div className="modal-overlay" onClick={() => setShowWeekShoppingModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('meals.generateWeekShoppingTitle')}</span>
              <button className="modal-close touch-target" onClick={() => setShowWeekShoppingModal(false)} aria-label={t('common.close')}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16 }}>{t('meals.generateWeekShoppingSummary')}</p>
              <div className="form-group">
                <label className="label" htmlFor="week-list-select">
                  {t('meals.targetList')}
                </label>
                <select id="week-list-select" className="input" value={selectedList} onChange={(e) => setSelectedList(e.target.value)}>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="stack-list compact">
                <div className="list-row">
                  <span>{t('meals.weekRecipeCount')}</span>
                  <strong>{weekShoppingPreview.recipeMealCount}</strong>
                </div>
                <div className="list-row">
                  <span>{t('meals.weekSkippedTextMeals')}</span>
                  <strong>{weekShoppingPreview.skippedTextMealsCount}</strong>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowWeekShoppingModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={() => void generateWeekShopping()} disabled={!selectedList || isOffline}>
                {t('common.add')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <StatusModal
        isOpen={!!weekShoppingResult}
        title={t('meals.generateWeekShoppingTitle')}
        message={weekShoppingResult ? t('meals.generateWeekShoppingSuccess', weekShoppingResult.addedCount) : ''}
        details={weekShoppingResult ? `${t('meals.weekSkippedTextMeals')}: ${weekShoppingResult.skippedTextMealsCount}` : null}
        primaryText={t('meals.openShopping')}
        onPrimary={() => navigate('/shopping')}
        onClose={() => setWeekShoppingResult(null)}
      />

      <StatusModal
        isOpen={!!weekShoppingError}
        title={t('meals.generateWeekShoppingTitle')}
        message={weekShoppingError || ''}
        onClose={() => setWeekShoppingError(null)}
      />
    </div>
  );
}

function MealDaySummary({
  dayItems,
  totalMacros,
  isToday,
}: {
  dayItems: any[];
  totalMacros: { calories: number; protein: number; carbs: number; fat: number };
  isToday: boolean;
}) {
  return (
    <>
      <span className={`compact-summary-pill ${dayItems.length ? '' : 'muted'}`}>{dayItems.length ? `${dayItems.length} comidas` : 'Sin plan'}</span>
      {isToday ? <span className="compact-summary-pill accent">Hoy</span> : null}
      <div className="planner-macros planner-macros-inline">
        {totalMacros.calories > 0 ? <span className="macro-badge-sm calories">{Math.round(totalMacros.calories)} kcal</span> : null}
        {totalMacros.protein > 0 ? <span className="macro-badge-sm protein">{Math.round(totalMacros.protein)}g P</span> : null}
        {totalMacros.carbs > 0 ? <span className="macro-badge-sm carbs">{Math.round(totalMacros.carbs)}g C</span> : null}
        {totalMacros.fat > 0 ? <span className="macro-badge-sm fat">{Math.round(totalMacros.fat)}g G</span> : null}
      </div>
    </>
  );
}

function getPreferredOpenDay(weekDays: Date[], mealMap: Record<string, any[]>) {
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  if (mealMap[todayKey] && weekDays.some((day) => format(day, 'yyyy-MM-dd') === todayKey)) {
    return todayKey;
  }

  const firstWithMeals = weekDays.find((day) => {
    const key = format(day, 'yyyy-MM-dd');
    return (mealMap[key] || []).length > 0;
  });

  return format(firstWithMeals || weekDays[0], 'yyyy-MM-dd');
}

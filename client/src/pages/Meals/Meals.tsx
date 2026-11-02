import { useEffect, useMemo, useState } from 'react';
import { addDays, addWeeks, format, isSameDay, startOfWeek, subWeeks } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { t } from '../../i18n';
import { dateFormats, dateLocale } from '../../i18n/date';
import { useOfflineStore } from '../../store/offline';
import { toastError, toastInfo, toastSuccess } from '../../store/toast';
import Icon from '../../components/Icon';
import StatusModal from '../../components/StatusModal';
import SectionHeader from '../../components/SectionHeader';
import './Meals.css';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
type MealType = (typeof MEAL_TYPES)[number];

type MealItem = {
  id: string;
  meal_type: string;
  recipe_id?: string | null;
  recipe_title?: string | null;
  text_content?: string | null;
  servings?: number | null;
  calories_per_serving?: number | null;
  protein_per_serving?: number | null;
  carbs_per_serving?: number | null;
  fat_per_serving?: number | null;
};

type RecipeOption = {
  id: string;
  title: string;
  image_url?: string | null;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  calories_per_serving?: number | null;
};

type ShopList = { id: string; name: string };

type WeekShoppingDecision = { key: string; action: 'add' | 'merge' | 'skip'; duplicateItemId?: string | null };
type WeekShoppingPreviewItem = {
  key: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  notes?: string | null;
  sources: Array<{ date: string; mealType: string; recipeTitle: string; ingredientName: string }>;
  candidates: Array<{ id: string; name: string; quantity?: number | null; unit?: string | null }>;
  defaultAction: 'add' | 'merge';
  defaultDuplicateItemId: string | null;
};
type WeekShoppingPreview = {
  recipeMealCount: number;
  skippedTextMealsCount: number;
  items: WeekShoppingPreviewItem[];
};

function errMsg(err: unknown): string {
  return err instanceof Error && err.message ? err.message : t('common.error');
}


function formatWeekRange(start: Date, end: Date): string {
  const loc = { locale: dateLocale() };
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const head = sameMonth ? 'd' : sameYear ? 'd MMM' : 'd MMM yyyy';
  const tail = sameYear && end.getFullYear() === new Date().getFullYear() ? 'd MMM' : 'd MMM yyyy';
  return `${format(start, head, loc)}–${format(end, tail, loc)}`;
}

export default function Meals() {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [mealMap, setMealMap] = useState<Record<string, MealItem[]>>({});
  const [editingNew, setEditingNew] = useState<{ date: string; type: string } | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editingItem, setEditingItem] = useState<{ id: string; field: 'servings' | 'text'; val: string | number } | null>(null);
  const [showShoppingModal, setShowShoppingModal] = useState<{ date: string; meal: string } | null>(null);
  const [ingredientText, setIngredientText] = useState('');
  const [lists, setLists] = useState<ShopList[]>([]);
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [selectedList, setSelectedList] = useState('');
  const [showWeekShoppingModal, setShowWeekShoppingModal] = useState(false);
  const [weekShoppingPreview, setWeekShoppingPreview] = useState<WeekShoppingPreview | null>(null);
  const [weekShoppingDecisions, setWeekShoppingDecisions] = useState<Record<string, WeekShoppingDecision>>({});
  const [weekShoppingPreviewLoading, setWeekShoppingPreviewLoading] = useState(false);
  const [weekShoppingResult, setWeekShoppingResult] = useState<{ addedCount: number; mergedCount: number; skippedCount: number; skippedTextMealsCount: number } | null>(null);
  const [weekShoppingError, setWeekShoppingError] = useState<string | null>(null);
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
    const nextMap: Record<string, MealItem[]> = {};
    (data as Array<{ date: string; items?: MealItem[] }>).forEach((day) => {
      nextMap[day.date.slice(0, 10)] = day.items || [];
    });
    setMealMap(nextMap);
    setLists(nextLists as ShopList[]);
    setRecipes(nextRecipes as RecipeOption[]);
    if (!selectedList && (nextLists as ShopList[]).length) {
      setSelectedList((nextLists as ShopList[])[0].id);
    }
  };

  useEffect(() => {
    void load();
  }, [weekStart]);

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
        toastInfo(t('mealsUi.savedOffline'), t('mealsUi.savedOfflineDetail'));
      } else {
        toastSuccess(t('mealsUi.added'));
      }
    } catch (err: unknown) {
      toastError(t('mealsUi.addFailed'), errMsg(err));
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
        toastInfo(t('mealsUi.updateSavedOffline'), t('mealsUi.updateSavedOfflineDetail'));
      } else {
        toastSuccess(t('mealsUi.updated'));
      }
    } catch (err: unknown) {
      toastError(t('mealsUi.updateFailed'), errMsg(err));
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await api.meals.deleteItem(id);
      await load();
      toastSuccess(t('mealsUi.deleted'));
    } catch (err: unknown) {
      toastError(t('mealsUi.deleteFailed'), errMsg(err));
    }
  };

  const addToShopping = async () => {
    if (!showShoppingModal || !selectedList) return;
    try {
      await api.meals.addToShopping(showShoppingModal.date, selectedList, ingredientText);
      setShowShoppingModal(null);
      setIngredientText('');
      toastSuccess(t('mealsUi.ingredientsAdded'), t('mealsUi.ingredientsAddedDetail'));
    } catch (err: unknown) {
      toastError(t('mealsUi.ingredientsFailed'), errMsg(err));
    }
  };

  const openWeekShoppingModal = async () => {
    if (!selectedList) return;
    setShowWeekShoppingModal(true);
    setWeekShoppingPreviewLoading(true);
    setWeekShoppingError(null);
    try {
      const preview = await api.meals.previewShoppingFromRange(
        format(weekStart, 'yyyy-MM-dd'),
        format(weekEnd, 'yyyy-MM-dd'),
        selectedList
      );
      setWeekShoppingPreview(preview as WeekShoppingPreview);
      setWeekShoppingDecisions(Object.fromEntries(
        ((preview as WeekShoppingPreview).items || []).map((item) => [
          item.key,
          { key: item.key, action: item.defaultAction, duplicateItemId: item.defaultDuplicateItemId },
        ])
      ));
    } catch (err: unknown) {
      setWeekShoppingError(errMsg(err));
      toastError(t('mealsUi.previewFailed'), errMsg(err));
    } finally {
      setWeekShoppingPreviewLoading(false);
    }
  };

  const setWeekDecision = (key: string, patch: Partial<WeekShoppingDecision>) => {
    setWeekShoppingDecisions((current) => ({
      ...current,
      [key]: { ...(current[key] || { key, action: 'add' as const }), ...patch },
    }));
  };

  const generateWeekShopping = async () => {
    try {
      const decisions = Object.values(weekShoppingDecisions);
      const result = await api.meals.generateShoppingFromRange(
        format(weekStart, 'yyyy-MM-dd'),
        format(weekEnd, 'yyyy-MM-dd'),
        selectedList,
        decisions
      );
      setShowWeekShoppingModal(false);
      setWeekShoppingResult({
        addedCount: result.addedCount || 0,
        mergedCount: result.mergedCount || 0,
        skippedCount: result.skippedCount || 0,
        skippedTextMealsCount: result.skippedTextMealsCount || 0,
      });
      toastSuccess(t('mealsUi.generated'), t('mealsUi.generatedDetail', result.addedCount || 0, result.mergedCount || 0));
    } catch (err: unknown) {
      setWeekShoppingError(errMsg(err));
      toastError(t('mealsUi.generateFailed'), errMsg(err));
    }
  };

  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <div className="page">
      <SectionHeader
        title={t('page.meals')}
        actions={
          <div className="meals-actions">
            <div className="meals-week-nav">
              <button type="button" className="icon-button" aria-label={t('mealsUi.prevWeek')} onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
                <Icon name="chevronLeft" size={20} />
              </button>
              <span className="meals-range">{formatWeekRange(weekStart, weekEnd)}</span>
              <button type="button" className="icon-button" aria-label={t('mealsUi.nextWeek')} onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
                <Icon name="chevronRight" size={20} />
              </button>
            </div>
            {isCurrentWeek ? null : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              >
                {t('mealsUi.thisWeek')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void openWeekShoppingModal()}
              disabled={isOffline || !selectedList}
            >
              <Icon name="cart" size={16} />
              {t('mealsUi.generateList')}
            </button>
          </div>
        }
      />

      <div className="meals-board">
        <div className="meals-head" aria-hidden="true">
          <span />
          {MEAL_TYPES.map((type) => (
            <span key={type}>{t(`meals.${type}`)}</span>
          ))}
          <span />
        </div>
        {weekDays.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const weekday = format(day, 'EEEE', { locale: dateLocale() });
          const dayItems = mealMap[dateStr] || [];
          const isToday = isSameDay(day, new Date());

          const dayLabel = format(day, dateFormats.weekdayDayMonth(), { locale: dateLocale() });
          const dayTitle = dayLabel.length ? dayLabel[0].toUpperCase() + dayLabel.slice(1) : dayLabel;
          const shortDay = format(day, 'EEE', { locale: dateLocale() });

          return (
            <section key={dateStr} aria-label={dayTitle} className={`meals-day${isToday ? ' is-today' : ''}`}>
              <h2 className="meals-day-name" aria-current={isToday ? 'date' : undefined}>
                <span>{shortDay.length ? shortDay[0].toUpperCase() + shortDay.slice(1) : shortDay}</span>
                <span className="meals-day-num">{format(day, 'd')}</span>
              </h2>

              <button
                type="button"
                className="btn-icon meals-day-cart"
                aria-label={t('mealsUi.addDayToShopping', weekday)}
                title={t('mealsUi.addDayToShopping', weekday)}
                onClick={() => {
                  setShowShoppingModal({ date: dateStr, meal: '' });
                  setIngredientText('');
                }}
              >
                <Icon name="cart" size={18} />
              </button>

              {MEAL_TYPES.map((type: MealType) => {
                const typeItems = dayItems.filter((item) => item.meal_type === type);
                const isEditingHere = editingNew?.date === dateStr && editingNew?.type === type;
                const typeName = t(`meals.${type}`);
                const addLabel = t('mealsUi.addMealAt', typeName, weekday);

                if (!typeItems.length && !isEditingHere) {
                  return (
                    <div key={type} className="meals-cell is-empty">
                      <button
                        type="button"
                        className="meals-add"
                        aria-label={addLabel}
                        title={addLabel}
                        onClick={() => startAddNew(dateStr, type)}
                      >
                        <Icon name="plus" size={16} />
                        <span className="meals-add-text">{typeName}</span>
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={type} className="meals-cell is-filled">
                    <span className="meals-cell-type">{typeName}</span>
                    <div className="meals-cell-body">
                      {typeItems.map((item, index) => {
                        const title = item.recipe_title || item.text_content || '';
                        const textEditorActive = editingItem?.id === item.id && editingItem?.field === 'text';
                        const servingsEditorActive = editingItem?.id === item.id && editingItem?.field === 'servings';
                        const servings = Number(item.servings) || 1;
                        const servingsLabel = servings === 1 ? t('mealsUi.servingsOne', servings) : t('mealsUi.servingsMany', servings);

                        return (
                          <div key={item.id} className="meals-item">
                            {textEditorActive ? (
                              <input
                                autoFocus
                                className="input"
                                aria-label={title}
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
                            ) : item.recipe_id ? (
                              <button
                                type="button"
                                className="meals-item-title"
                                title={title}
                                onClick={() => navigate(`/recipes/${item.recipe_id}`)}
                              >
                                <Icon name="book" size={14} />
                                <span>{title}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="meals-item-title"
                                title={title}
                                onClick={() =>
                                  setEditingItem({ id: item.id, field: 'text', val: item.text_content || '' })
                                }
                              >
                                <span>{title}</span>
                              </button>
                            )}

                            <div className="meals-item-actions">
                              {servingsEditorActive ? (
                                <input
                                  type="number"
                                  autoFocus
                                  className="input meals-servings-input"
                                  aria-label={servingsLabel}
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
                                  className="meals-servings"
                                  aria-label={servingsLabel}
                                  title={servingsLabel}
                                  onClick={() =>
                                    setEditingItem({ id: item.id, field: 'servings', val: servings })
                                  }
                                >
                                  x{servings}
                                </button>
                              )}
                              {index === typeItems.length - 1 && !isEditingHere ? (
                                <button
                                  type="button"
                                  className="btn-icon"
                                  aria-label={addLabel}
                                  title={addLabel}
                                  onClick={() => startAddNew(dateStr, type)}
                                >
                                  <Icon name="plus" size={16} />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn-icon"
                                aria-label={t('mealsUi.deleteMeal', title)}
                                title={t('mealsUi.deleteMeal', title)}
                                onClick={() => void deleteItem(item.id)}
                              >
                                <Icon name="trash" size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {isEditingHere ? (
                        <div className="meals-editor">
                          <input
                            className="input"
                            autoFocus
                            aria-label={t('common.search')}
                            placeholder={t('common.search')}
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveNewItem();
                              if (e.key === 'Escape') setEditingNew(null);
                            }}
                          />
                          {editVal.trim().length > 0 ? (
                            <div className="meals-suggestions">
                              {recipes
                                .filter((recipe) => recipe.title.toLowerCase().includes(editVal.toLowerCase()))
                                .slice(0, 5)
                                .map((recipe) => (
                                  <button
                                    key={recipe.id}
                                    type="button"
                                    className="meals-suggestion"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      void saveNewItem(recipe.id, recipe.title);
                                    }}
                                  >
                                    <span className="meals-suggestion-title">{recipe.title}</span>
                                    <span className="meals-suggestion-meta">
                                      {(recipe.prep_time_minutes ?? 0) > 0 ? (
                                        <span>{(recipe.prep_time_minutes ?? 0) + (recipe.cook_time_minutes ?? 0)} min</span>
                                      ) : null}
                                      {(recipe.calories_per_serving ?? 0) > 0 ? (
                                        <span>{Math.round(recipe.calories_per_serving ?? 0)} kcal</span>
                                      ) : null}
                                    </span>
                                  </button>
                                ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      {showShoppingModal ? (
        <div className="modal-overlay" onClick={() => setShowShoppingModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('recipes.addToShoppingList')}</span>
              <button className="modal-close touch-target" onClick={() => setShowShoppingModal(null)} aria-label={t('common.close')}>
                <Icon name="close" size={18} />
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
                <label className="label">{t('mealsUi.ingredientsLabel')}</label>
                <textarea
                  className="input"
                  placeholder={t('mealsUi.ingredientsPlaceholder')}
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
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('mealsUi.weekPreviewTitle')}</span>
              <button className="modal-close touch-target" onClick={() => setShowWeekShoppingModal(false)} aria-label={t('common.close')}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">

              <div className="form-group">
                <label className="label" htmlFor="week-list-select">{t('meals.targetList')}</label>
                <select
                  id="week-list-select"
                  className="input"
                  value={selectedList}
                  onChange={(e) => {
                    setSelectedList(e.target.value);
                    setWeekShoppingPreview(null);
                    setWeekShoppingDecisions({});
                  }}
                >
                  {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                </select>
              </div>

              {weekShoppingPreviewLoading ? (
                <div className="empty-state compact">{t('mealsUi.weekPreviewLoading')}</div>
              ) : weekShoppingPreview ? (
                <>
                  <div className="meals-preview-summary">
                    <div className="meals-preview-row"><span>{t('meals.weekRecipeCount')}</span><strong>{weekShoppingPreview.recipeMealCount}</strong></div>
                    <div className="meals-preview-row"><span>{t('meals.weekSkippedTextMeals')}</span><strong>{weekShoppingPreview.skippedTextMealsCount}</strong></div>
                    <div className="meals-preview-row"><span>{t('mealsUi.groupedIngredients')}</span><strong>{weekShoppingPreview.items.length}</strong></div>
                  </div>
                  <div className="meals-preview-list">
                    {weekShoppingPreview.items.map((item) => {
                      const decision = weekShoppingDecisions[item.key] || { key: item.key, action: item.defaultAction, duplicateItemId: item.defaultDuplicateItemId };
                      return (
                        <div key={item.key} className="meals-preview-item">
                          <div className="meals-preview-copy">
                            <strong>{item.name}</strong>
                            <p>
                              {item.quantity != null ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : t('mealsUi.noQuantity')}
                              {', '}{item.sources.length === 1 ? t('mealsUi.sourcesOne', item.sources.length) : t('mealsUi.sourcesMany', item.sources.length)}
                            </p>
                            <p className="meals-preview-muted">
                              {item.sources.slice(0, 3).map((source) => `${source.recipeTitle} (${source.date})`).join(', ')}
                            </p>
                            {item.candidates.length ? (
                              <p className="meals-preview-muted">{t('mealsUi.activeDuplicate', `${item.candidates[0].name}${item.candidates[0].quantity ? ` (${item.candidates[0].quantity}${item.candidates[0].unit ? ` ${item.candidates[0].unit}` : ''})` : ''}`)}</p>
                            ) : null}
                          </div>
                          <select
                            className="input"
                            aria-label={t('mealsUi.actionFor', item.name)}
                            value={decision.action}
                            onChange={(event) => setWeekDecision(item.key, { action: event.target.value as WeekShoppingDecision['action'] })}
                          >
                            <option value="add">{t('common.add')}</option>
                            <option value="merge" disabled={!item.candidates.length}>{t('mealsUi.mergeAction')}</option>
                            <option value="skip">{t('mealsUi.skipAction')}</option>
                          </select>
                        </div>
                      );
                    })}
                    {!weekShoppingPreview.items.length ? <div className="empty-state compact">{t('mealsUi.noWeekIngredients')}</div> : null}
                  </div>
                </>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={() => void openWeekShoppingModal()}>{t('mealsUi.recalc')}</button>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowWeekShoppingModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={() => void generateWeekShopping()} disabled={!selectedList || isOffline || weekShoppingPreviewLoading || !weekShoppingPreview?.items.length}>
                {t('mealsUi.confirmChanges')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <StatusModal
        isOpen={!!weekShoppingResult}
        title={t('meals.generateWeekShoppingTitle')}
        message={weekShoppingResult ? t('mealsUi.resultMessage', weekShoppingResult.addedCount, weekShoppingResult.mergedCount, weekShoppingResult.skippedCount) : ''}
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

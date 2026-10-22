import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { t } from '../../i18n';
import { useVoiceStore } from '../../store/voice';
import { toastError, toastSuccess } from '../../store/toast';
import StatusModal from '../../components/StatusModal';
import SectionHeader from '../../components/SectionHeader';
import Surface from '../../components/Surface';
import Icon from '../../components/Icon';
import type { RecipeRecord, RecipeRecordIngredient, VoiceRecipeSuggestion, ShoppingList } from '../../../../shared/contracts';
import './Recipes.css';

function metaLine(recipe: RecipeRecord): string {
  const parts: string[] = [];
  if (recipe.servings) parts.push(t(recipe.servings === 1 ? 'rec.servingsOne' : 'rec.servingsMany', recipe.servings));
  const mins = (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0);
  if (recipe.calories_per_serving) parts.push(`${recipe.calories_per_serving} kcal`);
  return parts.join(' · ');
}

function Stars({ value, onChange }: { value: number | null; onChange: (next: number | null) => void }) {
  return (
    <span className="recipe-stars" role="group" aria-label={t('rec.ratingLabel')}>
      <span className="recipe-stars-label" aria-hidden="true">{t('rec.ratingLabel')}</span>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-pressed={value === star}
          aria-label={t('rec.ratingStar', star)}
          title={t('rec.ratingStar', star)}
          onClick={() => onChange(value === star ? null : star)}
        >
          <Icon name="star" size={18} fill={value != null && star <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </span>
  );
}

export default function Recipes() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<RecipeRecord[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string }>>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [ingredientModal, setIngredientModal] = useState<{
    recipe: RecipeRecord;
    ingredients: RecipeRecordIngredient[];
    selected: string[];
    listId: string;
  } | null>(null);
  const [tagEditor, setTagEditor] = useState<{ recipe: RecipeRecord; value: string } | null>(null);
  const [suggestedRecipes, setSuggestedRecipes] = useState<VoiceRecipeSuggestion[] | null>(null);
  const [voiceMessage, setVoiceMessage] = useState<string>('');
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceFallback, setVoiceFallback] = useState<{ message: string; transcript: string } | null>(null);
  const [recipeToEnrich, setRecipeToEnrich] = useState<{
    name: string;
    ingredients: string[];
    instructions: string;
    index: number;
    imageUrl: string;
  } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = async () => {
    const data = await api.recipes.getAll({
      search: debouncedSearch,
      searchMode: 'hybrid',
      tags: selectedTag,
      favorite: favoriteOnly,
    });
    setRecipes(data);
  };

  useEffect(() => {
    void load();
  }, [debouncedSearch, selectedTag, favoriteOnly]);

  useEffect(() => {
    void Promise.all([
      api.recipes.getTags().catch(() => []),
      api.shopping.getLists().catch(() => []),
    ]).then(([tags, lists]) => {
      setAvailableTags(tags);
      setShoppingLists(lists);
    });
  }, []);

  const filtered = recipes;

  const updateRecipePreference = async (recipe: RecipeRecord, data: { isFavorite?: boolean; rating?: number | null }) => {
    const next = await api.recipes.updatePreferences(recipe.id, data);
    setRecipes((current) => current.map((item) => item.id === recipe.id ? { ...item, ...next } : item));
  };

  const openIngredientModal = async (recipe: RecipeRecord) => {
    const detail = await api.recipes.getById(recipe.id);
    const ingredients: RecipeRecordIngredient[] = detail.ingredients || [];
    setIngredientModal({
      recipe,
      ingredients,
      selected: ingredients.map((ingredient) => ingredient.id),
      listId: shoppingLists[0]?.id || '',
    });
  };

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
    } catch (err: unknown) {
      setSearch(finalText);
      setVoiceFallback({
        message: err instanceof Error ? err.message : t('common.error'),
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
      await load();
      setSuggestedRecipes(null);
      toastSuccess(t('rec.savedTitle'), t('rec.savedBody', name));
    } catch {
      toastError(t('rec.saveFailTitle'), t('common.error'));
    } finally {
      setSavingIndex(null);
    }
  };

  return (
    <div className="page">
      <SectionHeader
        title={t('page.recipes')}
        subtitle={t(filtered.length === 1 ? 'rec.countOne' : 'rec.countMany', filtered.length)}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/recipes/import')}>
            {t('recipes.importUrl')}
          </button>
        }
      />

      <div className="recipes-search">
        <Icon name="search" size={18} />
        <input
          className="input search-input"
          placeholder={t('rec.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('common.search')}
          type="search"
        />
      </div>
      <div className="recipes-chip-row" role="group" aria-label={t('rec.filterLabel')}>
        <button
          type="button"
          className={`chip ${favoriteOnly ? 'active' : ''}`}
          aria-pressed={favoriteOnly}
          onClick={() => setFavoriteOnly((current) => !current)}
        >
          {t('rec.favorites')}
        </button>
        {availableTags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className={`chip ${selectedTag === tag.name ? 'active' : ''}`}
            aria-pressed={selectedTag === tag.name}
            onClick={() => setSelectedTag((current) => current === tag.name ? '' : tag.name)}
          >
            {tag.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state recipes-empty">
          <p>{t('rec.emptyFilter')}</p>
          <p>{t('rec.emptyHint')}</p>
        </div>
      ) : (
        <ul className="recipes-list">
          {filtered.map((recipe) => {
            const meta = metaLine(recipe);
            const tags = (recipe.tags || []).map((tag) => tag.name).join(', ');
            return (
              <li key={recipe.id}>
                <article className="recipe-row" onClick={() => navigate(`/recipes/${recipe.id}`)}>
                  {recipe.image_url ? (
                    <img
                      src={recipe.image_url}
                      alt=""
                      className="recipe-row-thumb"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : null}
                  <div className="recipe-row-body">
                    <div className="recipe-row-title-row">
                      <h2 className="recipe-row-title">{recipe.title}</h2>
                      <button
                        type="button"
                        className="recipe-row-fav"
                        aria-pressed={!!recipe.is_favorite}
                        aria-label={t(recipe.is_favorite ? 'rec.removeFavorite' : 'rec.markFavorite')}
                        title={t(recipe.is_favorite ? 'rec.removeFavorite' : 'rec.markFavorite')}
                        onClick={(event) => {
                          event.stopPropagation();
                          void updateRecipePreference(recipe, { isFavorite: !recipe.is_favorite, rating: recipe.my_rating ?? null });
                        }}
                      >
                        <Icon name="star" size={20} fill={recipe.is_favorite ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                    {recipe.description ? <p className="recipe-row-desc">{recipe.description}</p> : null}
                    {meta ? <p className="recipe-row-meta">{meta}</p> : null}
                    {tags ? <p className="recipe-row-tags">{tags}</p> : null}
                    <div className="recipe-row-actions" onClick={(event) => event.stopPropagation()}>
                      <Stars
                        value={recipe.my_rating ?? null}
                        onChange={(rating) => void updateRecipePreference(recipe, { isFavorite: recipe.is_favorite, rating })}
                      />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTagEditor({ recipe, value: (recipe.tags || []).map((tag) => tag.name).join(', ') })}>{t('rec.tagsLabel')}</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openIngredientModal(recipe)}>{t('rec.addToShopping')}</button>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {tagEditor ? (
        <div className="modal-overlay" onClick={() => setTagEditor(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('rec.tagsLabel')}</span>
              <button className="modal-close touch-target" onClick={() => setTagEditor(null)} aria-label={t('common.close')}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">
              <input className="input" value={tagEditor.value} onChange={(event) => setTagEditor({ ...tagEditor, value: event.target.value })} placeholder={t('rec.tagsPlaceholder')} aria-label={t('rec.tagsAria')} />
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setTagEditor(null)}>{t('common.cancel')}</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    await api.recipes.updateTags(tagEditor.recipe.id, tagEditor.value.split(',').map((tag) => tag.trim()).filter(Boolean));
                    setTagEditor(null);
                    const tags = await api.recipes.getTags();
                    setAvailableTags(tags);
                    await load();
                  }}
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {ingredientModal ? (
        <div className="modal-overlay" onClick={() => setIngredientModal(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('rec.addIngredients')}</span>
              <button className="modal-close touch-target" onClick={() => setIngredientModal(null)} aria-label={t('common.close')}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">
              <label className="label" htmlFor="recipe-shopping-list">{t('page.shopping')}</label>
              <select id="recipe-shopping-list" className="input" value={ingredientModal.listId} onChange={(event) => setIngredientModal({ ...ingredientModal, listId: event.target.value })}>
                {shoppingLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
              </select>
              <div className="modal-stack">
                {ingredientModal.ingredients.map((ingredient) => (
                  <label key={ingredient.id} className="list-row">
                    <input
                      type="checkbox"
                      checked={ingredientModal.selected.includes(ingredient.id)}
                      onChange={() => setIngredientModal((current) => current ? {
                        ...current,
                        selected: current.selected.includes(ingredient.id)
                          ? current.selected.filter((id) => id !== ingredient.id)
                          : [...current.selected, ingredient.id],
                      } : current)}
                    />
                    <span>{ingredient.original_text || ingredient.name}</span>
                  </label>
                ))}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setIngredientModal(null)}>{t('common.cancel')}</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!ingredientModal.listId || ingredientModal.selected.length === 0}
                  onClick={async () => {
                    await api.recipes.addToShoppingList(ingredientModal.recipe.id, ingredientModal.listId, ingredientModal.selected);
                    setIngredientModal(null);
                    toastSuccess(t('rec.ingredientsAdded'));
                  }}
                >
                  {t('recipes.addToShoppingList')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {suggestedRecipes ? (
        <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '8vh', overflowY: 'auto' }} onClick={() => setSuggestedRecipes(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('recipes.suggestedTitle')}</span>
              <button className="modal-close touch-target" onClick={() => setSuggestedRecipes(null)} aria-label={t('common.close')}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16 }}>{voiceMessage}</p>
              {voiceTranscript ? (
                <div className="transcript-box">
                  <strong>{t('voice.transcriptLabel')}:</strong> {voiceTranscript}
                </div>
              ) : null}
              <div className="modal-stack">
                {suggestedRecipes.map((recipe, idx) => (
                  <Surface key={idx} className="suggested-recipe-card">
                    <h3>{recipe.name}</h3>
                    <div className="muted-inline">{recipe.time}</div>
                    <div className="muted-inline">
                      <strong>{t('recipes.ingredients')}:</strong> {recipe.ingredients.join(', ')}
                    </div>
                    <p>{recipe.instructions}</p>
                    <div className="surface-actions">
                      {recipe.id ? (
                        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/recipes/${recipe.id}`)}>
                          {t('recipes.existingMatching')}
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={savingIndex !== null}
                          onClick={() =>
                            setRecipeToEnrich({
                              name: recipe.name,
                              ingredients: recipe.ingredients,
                              instructions: recipe.instructions,
                              index: idx,
                              imageUrl: recipe.image || '',
                            })
                          }
                        >
                          {savingIndex === idx ? t('recipes.savingAi') : t('recipes.saveNewAi')}
                        </button>
                      )}
                    </div>
                  </Surface>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {recipeToEnrich ? (
        <div className="modal-overlay" onClick={() => setRecipeToEnrich(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('recipes.saveNewAi')}</span>
              <button className="modal-close touch-target" onClick={() => setRecipeToEnrich(null)} aria-label={t('common.close')}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16 }}>{t('recipes.saveNewAiConfirm', recipeToEnrich.name)}</p>
              <div className="form-group">
                <label className="label" htmlFor="enrich-image">{t('rec.enrichImageLabel')}</label>
                <input
                  id="enrich-image"
                  className="input"
                  type="url"
                  placeholder="https://..."
                  value={recipeToEnrich.imageUrl}
                  onChange={(e) => setRecipeToEnrich({ ...recipeToEnrich, imageUrl: e.target.value })}
                />
              </div>
              {recipeToEnrich.imageUrl ? (
                <div className="recipe-preview-box">
                  <img
                    src={recipeToEnrich.imageUrl}
                    alt={t('rec.previewAlt')}
                    className="recipes-preview"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    onLoad={(e) => {
                      e.currentTarget.style.display = 'block';
                    }}
                  />
                </div>
              ) : null}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setRecipeToEnrich(null)}>
                  {t('common.cancel')}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void confirmEnrich()}>
                  {savingIndex === recipeToEnrich.index ? t('recipes.savingAi') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <StatusModal
        isOpen={!!voiceFallback}
        title={t('recipes.voiceFallbackTitle')}
        message={voiceFallback?.message || ''}
        details={voiceFallback?.transcript ? `${t('voice.transcriptLabel')}: ${voiceFallback.transcript}` : null}
        primaryText={t('common.retry')}
        secondaryText={t('common.close')}
        onPrimary={voiceFallback?.transcript ? () => void handleVoiceResult(voiceFallback.transcript) : undefined}
        onSecondary={() => setVoiceFallback(null)}
        onClose={() => setVoiceFallback(null)}
      />
    </div>
  );
}

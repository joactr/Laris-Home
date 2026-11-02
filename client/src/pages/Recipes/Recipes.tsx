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

function Stars({ value, onChange }: { value: number | null; onChange: (next: number | null) => void }) {
  return (
    <span className="recipe-stars" role="group" aria-label={t('rec.ratingLabel')}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={value != null && star <= value ? 'is-filled' : undefined}
          aria-pressed={value === star}
          aria-label={t('rec.ratingStar', star)}
          title={t('rec.ratingStar', star)}
          onClick={() => onChange(value === star ? null : star)}
        >
          <Icon name="star" size={16} fill={value != null && star <= value ? 'currentColor' : 'none'} />
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
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/recipes/import')}>
            {t('recipes.importUrl')}
          </button>
        }
      />

      <div className="recipes-toolbar">
        <div className="recipes-search">
          <Icon name="search" size={16} />
          <input
            className="input search-input"
            placeholder={t('common.search')}
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
      </div>

      {filtered.length === 0 ? (
        <p className="empty-state">{t('rec.emptyFilter')}</p>
      ) : (
        <ul className="recipes-grid">
          {filtered.map((recipe) => (
            <li key={recipe.id}>
              <article className="recipe-card" onClick={() => navigate(`/recipes/${recipe.id}`)}>
                {recipe.image_url ? (
                  <div className="recipe-card-media">
                    <img
                      src={recipe.image_url}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                ) : null}
                <div className="recipe-card-body">
                  <div className="recipe-card-head">
                    <h2 className="recipe-card-title">
                      <button type="button" className="recipe-card-link" title={recipe.title}>{recipe.title}</button>
                    </h2>
                    <button
                      type="button"
                      className="btn-icon recipe-card-fav"
                      aria-pressed={!!recipe.is_favorite}
                      aria-label={t(recipe.is_favorite ? 'rec.removeFavorite' : 'rec.markFavorite')}
                      title={t(recipe.is_favorite ? 'rec.removeFavorite' : 'rec.markFavorite')}
                      onClick={(event) => {
                        event.stopPropagation();
                        void updateRecipePreference(recipe, { isFavorite: !recipe.is_favorite, rating: recipe.my_rating ?? null });
                      }}
                    >
                      <Icon name="star" size={18} fill={recipe.is_favorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  {recipe.servings || recipe.calories_per_serving ? (
                    <p className="recipe-card-meta">
                      {recipe.servings ? <span>{t('rec.servingsShort', recipe.servings)}</span> : null}
                      {recipe.calories_per_serving ? <span>{recipe.calories_per_serving} kcal</span> : null}
                    </p>
                  ) : null}
                  <div className="recipe-card-footer" onClick={(event) => event.stopPropagation()}>
                    <Stars
                      value={recipe.my_rating ?? null}
                      onChange={(rating) => void updateRecipePreference(recipe, { isFavorite: recipe.is_favorite, rating })}
                    />
                    <span className="recipe-card-actions">
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label={t('rec.tagsLabel')}
                        title={t('rec.tagsLabel')}
                        onClick={() => setTagEditor({ recipe, value: (recipe.tags || []).map((tag) => tag.name).join(', ') })}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                          <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" />
                          <path d="M7.5 7.5h.01" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label={t('rec.addToShopping')}
                        title={t('rec.addToShopping')}
                        onClick={() => void openIngredientModal(recipe)}
                      >
                        <Icon name="cart" size={18} />
                      </button>
                    </span>
                  </div>
                </div>
              </article>
            </li>
          ))}
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
        <div className="modal-overlay" onClick={() => setSuggestedRecipes(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{t('recipes.suggestedTitle')}</span>
              <button className="modal-close touch-target" onClick={() => setSuggestedRecipes(null)} aria-label={t('common.close')}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="recipes-modal-note">{voiceMessage}</p>
              {voiceTranscript ? (
                <div className="transcript-box">
                  <strong>{t('voice.transcriptLabel')}:</strong> {voiceTranscript}
                </div>
              ) : null}
              <div className="modal-stack">
                {suggestedRecipes.map((recipe, idx) => (
                  <Surface key={idx} as="div" className="suggested-recipe-card">
                    <div className="suggested-recipe-info">
                      <h3>{recipe.name}</h3>
                      {recipe.time ? <span className="muted-inline">{recipe.time}</span> : null}
                    </div>
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
              <p className="recipes-modal-note">{t('recipes.saveNewAiConfirm', recipeToEnrich.name)}</p>
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

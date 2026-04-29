import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { t } from '../../i18n';
import { useVoiceStore } from '../../store/voice';
import { toastError, toastSuccess } from '../../store/toast';
import StatusModal from '../../components/StatusModal';
import SectionHeader from '../../components/SectionHeader';
import Surface from '../../components/Surface';
import type { RecipeRecord, VoiceRecipeSuggestion } from '../../../../shared/contracts';

export default function Recipes() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<RecipeRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string }>>([]);
  const [shoppingLists, setShoppingLists] = useState<any[]>([]);
  const [ingredientModal, setIngredientModal] = useState<{
    recipe: RecipeRecord;
    ingredients: Array<{ id: string; name: string; original_text: string }>;
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

  const load = async () => {
    const data = await api.recipes.getAll({
      search,
      tags: selectedTag,
      favorite: favoriteOnly,
    });
    setRecipes(data);
  };

  useEffect(() => {
    void load();
  }, [search, selectedTag, favoriteOnly]);

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
    setIngredientModal({
      recipe,
      ingredients: (detail.ingredients || []) as any[],
      selected: (detail.ingredients || []).map((ingredient) => ingredient.id),
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
      toastSuccess('Receta guardada', `${name} ya está en tu recetario.`);
    } catch {
      toastError('No se pudo guardar la receta', t('common.error'));
    } finally {
      setSavingIndex(null);
    }
  };

  return (
    <div className="page page-recipes">
      <SectionHeader
        eyebrow="Recetario"
        title={t('page.recipes')}
        subtitle={`${filtered.length} receta${filtered.length === 1 ? '' : 's'} visibles`}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => navigate('/recipes/import')}>
            {t('recipes.importUrl')}
          </button>
        }
      />

      <Surface className="recipes-toolbar">
        <input
          className="input search-input"
          placeholder={`${t('common.search')}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('common.search')}
        />
        <div className="suggestion-row">
          <button type="button" className={`chip ${favoriteOnly ? 'active' : ''}`} onClick={() => setFavoriteOnly((current) => !current)}>
            ★ Favoritas
          </button>
          {availableTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={`chip ${selectedTag === tag.name ? 'active' : ''}`}
              onClick={() => setSelectedTag((current) => current === tag.name ? '' : tag.name)}
            >
              {tag.name}
            </button>
          ))}
        </div>
      </Surface>

      <div className="recipes-grid">
        {filtered.map((recipe) => (
          <article key={recipe.id} className="recipe-card" onClick={() => navigate(`/recipes/${recipe.id}`)}>
            <div className="recipe-image-placeholder">
              {recipe.image_url ? (
                <img
                  src={recipe.image_url}
                  alt={recipe.title}
                  className="recipe-image"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : null}
            </div>
              <div className="recipe-info">
                <div className="recipe-card-topline">
                  {recipe.servings ? <span>{recipe.servings} raciones</span> : <span>Receta</span>}
                  {recipe.prep_time_minutes ? <span>{recipe.prep_time_minutes + (recipe.cook_time_minutes || 0)} min</span> : null}
                </div>
              <h3 className="recipe-title">{recipe.title}</h3>
              <p className="recipe-description">{recipe.description || 'Sin descripción todavía.'}</p>
              {recipe.tags?.length ? (
                <div className="suggestion-row">
                  {recipe.tags.map((tag) => <span key={tag.id} className="chip">{tag.name}</span>)}
                </div>
              ) : null}

              {recipe.calories_per_serving || recipe.protein_per_serving || recipe.carbs_per_serving || recipe.fat_per_serving ? (
                <div className="planner-macros">
                  {recipe.calories_per_serving ? <span className="macro-badge-sm calories">{recipe.calories_per_serving} kcal</span> : null}
                  {recipe.carbs_per_serving ? <span className="macro-badge-sm carbs">{recipe.carbs_per_serving}g C</span> : null}
                  {recipe.fat_per_serving ? <span className="macro-badge-sm fat">{recipe.fat_per_serving}g G</span> : null}
                  {recipe.protein_per_serving ? <span className="macro-badge-sm protein">{recipe.protein_per_serving}g P</span> : null}
                </div>
              ) : null}
              <div className="surface-actions" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void updateRecipePreference(recipe, { isFavorite: !recipe.is_favorite, rating: recipe.my_rating ?? null })}>
                  {recipe.is_favorite ? '★' : '☆'}
                </button>
                <select
                  className="input"
                  style={{ width: 86, padding: '6px 8px' }}
                  value={recipe.my_rating || ''}
                  onChange={(event) => void updateRecipePreference(recipe, { isFavorite: recipe.is_favorite, rating: event.target.value ? Number(event.target.value) : null })}
                >
                  <option value="">Nota</option>
                  {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}★</option>)}
                </select>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTagEditor({ recipe, value: (recipe.tags || []).map((tag) => tag.name).join(', ') })}>
                  Tags
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void openIngredientModal(recipe)}>
                  Compra
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {tagEditor ? (
        <div className="modal-overlay" onClick={() => setTagEditor(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Etiquetas</span>
              <button className="modal-close touch-target" onClick={() => setTagEditor(null)} aria-label={t('common.close')}>×</button>
            </div>
            <div className="modal-body">
              <input className="input" value={tagEditor.value} onChange={(event) => setTagEditor({ ...tagEditor, value: event.target.value })} placeholder="rápida, cena, vegetariana" />
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
              <span className="modal-title">Añadir ingredientes</span>
              <button className="modal-close touch-target" onClick={() => setIngredientModal(null)} aria-label={t('common.close')}>×</button>
            </div>
            <div className="modal-body">
              <select className="input" value={ingredientModal.listId} onChange={(event) => setIngredientModal({ ...ingredientModal, listId: event.target.value })}>
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
                    toastSuccess('Ingredientes añadidos');
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
                ×
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
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16 }}>{t('recipes.saveNewAiConfirm', recipeToEnrich.name)}</p>
              <div className="form-group">
                <label className="label">URL de la Imagen (opcional)</label>
                <input
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
                    alt="Vista previa"
                    style={{ width: '100%', maxHeight: 220, borderRadius: 14, objectFit: 'cover' }}
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

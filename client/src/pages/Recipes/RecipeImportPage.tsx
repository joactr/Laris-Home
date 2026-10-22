import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { t } from '../../i18n';
import { toastError, toastSuccess } from '../../store/toast';
import Icon from '../../components/Icon';
import type { ImportedRecipe, RecipeIngredient } from '../../../../shared/contracts';
import './Recipes.css';

export default function RecipeImportPage() {
    const navigate = useNavigate();
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recipe, setRecipe] = useState<ImportedRecipe | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleImport = async () => {
        if (!url) return;
        setLoading(true);
        setError(null);
        try {
            const data = await api.recipes.importFromUrl(url);
            setRecipe(data);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t('rec.importError');
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!recipe) return;
        if (!recipe.title.trim()) {
            setError(t('rec.importTitleRequired'));
            return;
        }
        setIsSaving(true);
        try {
            await api.recipes.save({
                title: recipe.title,
                description: recipe.description ?? '',
                sourceUrl: recipe.sourceUrl ?? null,
                imageUrl: recipe.imageUrl ?? null,
                servings: recipe.servings ?? null,
                prepTimeMinutes: recipe.prepTimeMinutes ?? null,
                cookTimeMinutes: recipe.cookTimeMinutes ?? null,
                caloriesPerServing: recipe.caloriesPerServing ?? null,
                proteinPerServing: recipe.proteinPerServing ?? null,
                carbsPerServing: recipe.carbsPerServing ?? null,
                fatPerServing: recipe.fatPerServing ?? null,
                ingredients: recipe.ingredients,
                instructions: recipe.instructions,
            });
            toastSuccess(t('rec.createdTitle'), t('rec.createdBody'));
            navigate('/recipes');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t('rec.saveError');
            setError(message);
        } finally {
            setIsSaving(false);
        }
    };

    const updateIngredient = (idx: number, patch: Partial<RecipeIngredient>) => {
        if (!recipe) return;
        const next = [...recipe.ingredients];
        next[idx] = { ...next[idx], ...patch };
        setRecipe({ ...recipe, ingredients: next });
    };

    if (recipe) {
        return (
            <div className="page">
                <div className="recipe-detail-top">
                    <button className="icon-button" onClick={() => setRecipe(null)} aria-label={t('common.back')}>
                        <Icon name="chevronLeft" size={20} />
                    </button>
                    <h1>{t('rec.reviewImported')}</h1>
                </div>

                <form className="recipes-form" onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
                    {error ? <div className="recipes-form-error" role="alert">{error}</div> : null}

                    <section className="recipes-form-section" aria-label={t('rec.basicData')}>
                        <div className="form-group">
                            <label className="label" htmlFor="import-title">{t('recipes.title')}</label>
                            <input
                                id="import-title"
                                className="input"
                                value={recipe.title}
                                onChange={e => setRecipe({ ...recipe, title: e.target.value })}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label className="label" htmlFor="import-description">{t('recipes.description')}</label>
                            <textarea
                                id="import-description"
                                className="input"
                                value={recipe.description}
                                onChange={e => setRecipe({ ...recipe, description: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label className="label" htmlFor="import-image">{t('rec.imageUrlOptional')}</label>
                            <input
                                id="import-image"
                                className="input"
                                type="url"
                                placeholder="https://..."
                                value={recipe.imageUrl || ''}
                                onChange={e => setRecipe({ ...recipe, imageUrl: e.target.value })}
                            />
                            {recipe.imageUrl ? (
                                <img
                                    src={recipe.imageUrl}
                                    alt={t('rec.previewAlt')}
                                    className="recipes-preview"
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                    onLoad={(e) => (e.currentTarget.style.display = 'block')}
                                />
                            ) : null}
                        </div>
                    </section>

                    <section className="recipes-form-section" aria-label={t('rec.servingsTimes')}>
                        <h2>{t('rec.servingsTimes')}</h2>
                        <div className="field-grid three">
                            <div className="form-group">
                                <label className="label" htmlFor="import-servings">{t('recipes.servings')}</label>
                                <input
                                    id="import-servings"
                                    type="number"
                                    min={1}
                                    className="input"
                                    value={recipe.servings || ''}
                                    onChange={e => setRecipe({ ...recipe, servings: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="label" htmlFor="import-prep">{t('recipes.prepTime')}{t('rec.minSuffix')}</label>
                                <input
                                    id="import-prep"
                                    type="number"
                                    min={0}
                                    className="input"
                                    value={recipe.prepTimeMinutes || ''}
                                    onChange={e => setRecipe({ ...recipe, prepTimeMinutes: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="label" htmlFor="import-cook">{t('recipes.cookTime')}{t('rec.minSuffix')}</label>
                                <input
                                    id="import-cook"
                                    type="number"
                                    min={0}
                                    className="input"
                                    value={recipe.cookTimeMinutes || ''}
                                    onChange={e => setRecipe({ ...recipe, cookTimeMinutes: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="recipes-form-section" aria-label={t('rec.nutritionPerServing')}>
                        <h2>{t('rec.nutritionPerServing')}</h2>
                        <div className="field-grid two">
                            <div className="form-group">
                                <label className="label" htmlFor="import-kcal">{t('recipes.calories')}</label>
                                <input
                                    id="import-kcal"
                                    type="number"
                                    min={0}
                                    className="input"
                                    value={recipe.caloriesPerServing || ''}
                                    onChange={e => setRecipe({ ...recipe, caloriesPerServing: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="label" htmlFor="import-protein">{t('recipes.protein')}{t('rec.gramSuffix')}</label>
                                <input
                                    id="import-protein"
                                    type="number"
                                    min={0}
                                    className="input"
                                    value={recipe.proteinPerServing || ''}
                                    onChange={e => setRecipe({ ...recipe, proteinPerServing: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="label" htmlFor="import-carbs">{t('recipes.carbs')}{t('rec.gramSuffix')}</label>
                                <input
                                    id="import-carbs"
                                    type="number"
                                    min={0}
                                    className="input"
                                    value={recipe.carbsPerServing || ''}
                                    onChange={e => setRecipe({ ...recipe, carbsPerServing: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="label" htmlFor="import-fat">{t('recipes.fat')}{t('rec.gramSuffix')}</label>
                                <input
                                    id="import-fat"
                                    type="number"
                                    min={0}
                                    className="input"
                                    value={recipe.fatPerServing || ''}
                                    onChange={e => setRecipe({ ...recipe, fatPerServing: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="recipes-form-section" aria-label={t('recipes.ingredients')}>
                        <h2>{t('recipes.ingredients')}</h2>
                        <div className="recipes-ingredient-rows">
                            {recipe.ingredients.map((ing: RecipeIngredient, idx: number) => (
                                <div key={idx} className="recipes-ingredient-row">
                                    <input
                                        className="input"
                                        value={ing.name}
                                        aria-label={t('rec.ingredientNameAria', idx + 1)}
                                        onChange={e => updateIngredient(idx, { name: e.target.value })}
                                    />
                                    <input
                                        className="input"
                                        type="number"
                                        min={0}
                                        value={ing.quantity ?? ''}
                                        aria-label={t('rec.ingredientQtyAria', idx + 1)}
                                        onChange={e => updateIngredient(idx, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                                    />
                                    <input
                                        className="input"
                                        value={ing.unit ?? ''}
                                        aria-label={t('rec.ingredientUnitAria', idx + 1)}
                                        onChange={e => updateIngredient(idx, { unit: e.target.value })}
                                    />
                                    <span className="recipe-row-meta" aria-hidden="true">{ing.quantity ?? ''} {ing.unit ?? ''}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="recipes-form-section" aria-label={t('recipes.instructions')}>
                        <div className="form-group">
                            <label className="label" htmlFor="import-steps">{t('rec.instructionsOnePerLine', t('recipes.instructions'))}</label>
                            <textarea
                                id="import-steps"
                                className="input"
                                style={{ minHeight: 200 }}
                                value={recipe.instructions.join('\n')}
                                onChange={e => setRecipe({ ...recipe, instructions: e.target.value.split('\n') })}
                            />
                        </div>
                    </section>

                    <div className="recipes-form-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setRecipe(null)}>{t('common.cancel')}</button>
                        <button type="submit" className="btn btn-primary" disabled={isSaving}>
                            {isSaving ? t('common.loading') : t('common.save')}
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="recipe-detail-top">
                <button className="icon-button" onClick={() => navigate('/recipes')} aria-label={t('common.back')}>
                    <Icon name="chevronLeft" size={20} />
                </button>
                <h1>{t('recipes.importUrl')}</h1>
            </div>
            <p className="recipe-detail-meta">{t('rec.importHint')}</p>

            <form className="recipes-form" onSubmit={(e) => { e.preventDefault(); void handleImport(); }}>
                <div className="form-group">
                    <label className="label" htmlFor="recipe-import-url">{t('rec.recipeUrlLabel')}</label>
                    <input
                        id="recipe-import-url"
                        className="input"
                        type="url"
                        placeholder={t('rec.recipeUrlPh')}
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        required
                    />
                </div>
                {error ? <div className="recipes-form-error" role="alert">{error}</div> : null}
                <div className="recipes-form-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => navigate('/recipes')}>{t('common.cancel')}</button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading || !url}
                    >
                        {loading ? t('common.loading') : t('recipes.importBtn')}
                    </button>
                </div>
            </form>
        </div>
    );
}

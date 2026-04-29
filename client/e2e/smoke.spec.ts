import { expect, test, type Page } from '@playwright/test';

const credentials = {
    username: process.env.PLAYWRIGHT_USERNAME || 'JM',
    password: process.env.PLAYWRIGHT_PASSWORD || 'password123',
};

async function login(page: Page) {
    await page.goto('/login');
    await page.locator('#auth-username').fill(credentials.username);
    await page.locator('#auth-password').fill(credentials.password);
    await page.locator('#auth-submit').click();
    await expect(page).toHaveURL(/\/$/);
}

test('shows a validation error on invalid login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#auth-username').fill(credentials.username);
    await page.locator('#auth-password').fill('wrong-password');
    await page.locator('#auth-submit').click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/credenciales|invalid/i)).toBeVisible();
});

test('creates a project task from the board flow', async ({ page }) => {
    const projectName = `PW Project ${Date.now()}`;
    const taskTitle = `PW Task ${Date.now()}`;

    await login(page);
    await page.goto('/projects');
    await page.locator('#projects-add').click();
    await page.locator('#project-name').fill(projectName);
    await page.locator('#project-save').click();

    await page.getByText(projectName, { exact: true }).click();
    await page.locator('#task-add').click();
    await page.locator('#task-title').fill(taskTitle);
    await page.locator('#task-save').click();

    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
});

test('creates a calendar event', async ({ page }) => {
    const eventTitle = `PW Event ${Date.now()}`;

    await login(page);
    await page.goto('/calendar');
    await page.getByRole('button', { name: /\+ Evento/i }).click();
    await page.locator('#event-title').fill(eventTitle);
    await page.locator('#event-save').click();

    await expect(page.getByText(eventTitle, { exact: true }).first()).toBeVisible();
});

test('imports and saves a recipe with a mocked import response', async ({ page }) => {
    const recipeTitle = `PW Recipe ${Date.now()}`;

    await page.route('**/api/recipes/import-from-url', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                title: recipeTitle,
                description: 'Smoke recipe',
                servings: 2,
                prepTimeMinutes: 10,
                cookTimeMinutes: 20,
                caloriesPerServing: 300,
                proteinPerServing: 20,
                carbsPerServing: 25,
                fatPerServing: 12,
                imageUrl: '',
                ingredients: [
                    { name: 'tomate', originalText: '2 tomates', quantity: 2, unit: null, notes: null },
                ],
                instructions: ['Mezclar todo'],
            }),
        });
    });

    await login(page);
    await page.goto('/recipes/import');
    await page.getByLabel('URL de la Receta').fill('https://example.com/smoke-recipe');
    await page.getByRole('button', { name: /importar/i }).click();
    await page.getByRole('button', { name: /guardar/i }).click();

    await expect(page).toHaveURL(/\/recipes$/);
    await expect(page.getByText(recipeTitle, { exact: true })).toBeVisible();
});

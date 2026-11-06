import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US' });

test('new project opens the shared canvas form and creates one ecommerce canvas', async ({
  page,
}) => {
  const creations: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/demo/create-canvas'
    ) {
      creations.push(request.postData() ?? '');
    }
  });
  await page.goto('/projects');
  await page.getByRole('link', { name: 'New project', exact: true }).first().click();
  await expect(page).toHaveURL(/\/canvas\/?$/);
  await expect(page.getByRole('button', { name: /Product imagery/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Project name').fill('E2E canvas');
  await page.getByRole('button', { name: 'Create and open canvas', exact: true }).click();
  await expect(page).toHaveURL(/\/canvas\/[^/?]+$/);
  await expect(page.getByRole('heading', { name: 'Create a creative canvas', exact: true })).toHaveCount(0);
  expect(creations).toHaveLength(1);
  expect(JSON.parse(creations[0])).toMatchObject({ name: 'E2E canvas', template: 'ecommerce', locale: 'en' });
});

test('failed canvas creation can be submitted again', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/demo/create-canvas', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    expect(route.request().postDataJSON().template).toBe('ecommerce');
    attempts += 1;
    if (attempts === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Creation temporarily unavailable' }),
      });
    }
    return route.continue();
  });
  await page.goto('/canvas');
  await page.getByLabel('Project name').fill('Retry canvas');
  await page.getByRole('button', { name: 'Create and open canvas', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Creation temporarily unavailable');
  await page.getByRole('button', { name: 'Create and open canvas', exact: true }).click();
  await expect(page).toHaveURL(/\/canvas\/[^/?]+$/);
  expect(attempts).toBe(2);
});

test('direct canvas entry keeps the prompt on the created project', async ({ page }) => {
  let creations = 0;
  let openedProjectUrl: URL | undefined;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.isNavigationRequest() && /^\/canvas\/[^/]+$/.test(url.pathname)) openedProjectUrl = url;
    if (
      request.method() === 'POST' &&
      url.pathname === '/api/demo/create-canvas'
    )
      creations += 1;
  });
  await page.goto('/canvas?target=image&model=nano-banana-pro&prompt=Entry+test');
  const create = page.getByRole('button', { name: 'Create and open canvas', exact: true });
  await expect(create).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create in Studio', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Project name')).toHaveValue('Entry test');
  expect(creations).toBe(0);
  await create.click();
  await expect(page).toHaveURL(/\/canvas\/[^/?]+/);
  expect(openedProjectUrl).toBeDefined();
  const url = openedProjectUrl!;
  expect(url.searchParams.get('target')).toBe('image');
  expect(url.searchParams.get('model')).toBe('nano-banana-pro');
  expect(url.searchParams.get('prompt')).toBe('Entry test');
  const id = url.pathname.split('/').at(-1)!;
  await expect.poll(async () => {
    const snapshot = await (await page.request.get(`/api/app/projects/${id}/snapshot`)).json();
    return snapshot.document.cards.some((card: { prompt?: string }) => card.prompt === 'Entry test');
  }).toBe(true);
  expect(creations).toBe(1);
});

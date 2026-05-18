import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ISTQB = path.resolve(
  here,
  '..',
  '..',
  'api',
  'tests',
  'fixtures',
  'istqb-ctal-ta-syllabus-en.pdf',
)

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('md-bridge:locale', 'en')
  })
})

test('Batch: two PDFs queue up, run sequentially, each downloadable', async ({ page }) => {
  await page.goto('/convert/pdf-to-md')

  // Drop the same ISTQB fixture twice through the file input (multiple is on).
  await page.locator('input[type="file"]').setInputFiles([ISTQB, ISTQB])

  // The batch list shows two queued rows.
  const list = page.locator('.batch__list')
  await expect(list).toBeVisible({ timeout: 30_000 })
  await expect(list.locator('.batch__row')).toHaveCount(2)
  await expect(page.getByText(/2 files queued/i)).toBeVisible()

  // Kick the run.
  await page.getByRole('button', { name: /convert all/i }).click()

  // Both rows finish (real /api/pdf-to-md round-trips for each).
  await expect(list.locator('.batch__row--done')).toHaveCount(2, { timeout: 120_000 })

  // Per-item download is available (label is the localized .md download text).
  const firstDownload = list.locator('.batch__row').first().getByRole('button', {
    name: /download \.md/i,
  })
  const dl = page.waitForEvent('download')
  await firstDownload.click()
  const file = await dl
  expect(file.suggestedFilename()).toMatch(/\.md$/)
})

test('Batch: clearing the list cancels and empties the queue', async ({ page }) => {
  await page.goto('/convert/pdf-to-md')
  await page.locator('input[type="file"]').setInputFiles([ISTQB, ISTQB])
  await expect(page.locator('.batch__row')).toHaveCount(2)

  await page.getByRole('button', { name: /clear list/i }).click()
  await expect(page.locator('.batch__list')).toHaveCount(0)
})

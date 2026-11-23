import { expect } from '@playwright/test'

/**
 * The read-only Novidades editor draws only the lines near the viewport, so older
 * versions are absent from the DOM until scrolled to. Scrolls until `locator` exists.
 */
export async function scrollNewsTo(page, locator) {
  await expect(async () => {
    if (await locator.count()) return
    await page.evaluate(() => {
      const scroller = document.querySelector('.visual-editor.read-only .cm-scroller')
      const target = [scroller, document.scrollingElement].find(
        (element) => element && element.scrollHeight > element.clientHeight,
      )
      target?.scrollBy(0, Math.max(400, window.innerHeight * 0.8))
    })
    expect(await locator.count()).toBeGreaterThan(0)
  }).toPass({ timeout: 15000, intervals: [50] })
  await locator.first().scrollIntoViewIfNeeded()
}

/** Finds `text` in the Novidades hub, opens `version` and returns the editor locator. */
export async function openRelease(page, news, text, version) {
  await scrollNewsTo(page, news.getByText(text))
  const link = news.locator(`[data-wiki^="Sloth Note ${version}"]`)
  await scrollNewsTo(page, link)
  await link.first().click()
}

import { expect, test } from "@playwright/test";

test("advances from camera prep to countdown", async ({ page }) => {
  await page.addInitScript(() => {
    const getUserMedia = (): Promise<MediaStream> => Promise.resolve(new MediaStream());

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia
      }
    });
  });

  await page.goto("/");

  await page.locator('button[data-action="camera"]').click();

  const startButton = page.locator('button[data-action="start"]');
  await expect(startButton).toHaveText("スタート");
  await expect(startButton).toBeVisible();

  await startButton.click();
  await expect(page.locator(".countdown")).toHaveText(/\d/);
});

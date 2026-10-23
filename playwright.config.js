import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Reduced motion keeps axe from measuring contrast in the middle of a transition.
  use: { baseURL: 'http://localhost:5199', trace: 'retain-on-failure', reducedMotion: 'reduce' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: 'mobile/**' },
    {
      name: 'mobile',
      testMatch: 'mobile/**/*.spec.js',
      use: { ...devices['Pixel 7'], baseURL: 'http://localhost:5199/?platform=mobile' },
    },
  ],
  webServer: {
    command: 'bunx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
  },
})

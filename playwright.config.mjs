import { defineConfig } from '@playwright/test'

const appUrl = 'http://127.0.0.1:4178'
const dataDir = process.env.MULTIPLAYER_DATA_DIR

if (!dataDir) {
  throw new Error('MULTIPLAYER_DATA_DIR must point to the disposable CI fixture directory.')
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: 'line',
  forbidOnly: !!process.env.CI,
  outputDir: `${dataDir}-results`,
  use: {
    baseURL: appUrl,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    launchOptions: { chromiumSandbox: true },
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
  webServer: [
    {
      command: 'env -i PATH="$PATH" TMPDIR="${RUNNER_TEMP:-/tmp}" MULTIPLAYER_HOST=127.0.0.1 MULTIPLAYER_PORT=4179 MULTIPLAYER_ALLOWED_ORIGINS=http://127.0.0.1:4178 MULTIPLAYER_DATA_DIR="$MULTIPLAYER_DATA_DIR" node packages/server/dist/multiplayer/server.js --fixture-count 2',
      url: 'http://127.0.0.1:4179/mp-api/snapshot',
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      command: 'env -i PATH="$PATH" TMPDIR="${RUNNER_TEMP:-/tmp}" node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4178 --strictPort',
      cwd: 'packages/web',
      url: `${appUrl}/multiplayer-3d`,
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
})

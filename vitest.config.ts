import { playwright } from '@vitest/browser-playwright'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    alias: {
      webauthx: path.resolve(import.meta.dirname, 'src'),
      'webauthx/client': path.resolve(import.meta.dirname, 'src/client/index.ts'),
      'webauthx/server': path.resolve(import.meta.dirname, 'src/server/index.ts'),
    },
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          setupFiles: ['test/authenticator.setup.ts'],
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: 'chromium' }],
            provider: playwright(),
            screenshotFailures: false,
          },
        },
      },
    ],
  },
})

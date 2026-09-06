import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // Pure tests run in happy-dom; component/composable tests opt into the Nuxt
    // runtime per-file via `// @vitest-environment nuxt`.
    environment: 'happy-dom',
    include: ['test/**/*.test.ts']
  }
})

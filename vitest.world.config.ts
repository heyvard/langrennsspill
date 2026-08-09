/**
 * Egen kjøring for løypevalidatoren. Den er treg og svarer på et annet
 * spørsmål enn testene, så den skal ikke ligge i `pnpm test`-løpet —
 * derfor heter filene `*.check.ts` og har sin egen include her.
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.check.ts'],
  },
})

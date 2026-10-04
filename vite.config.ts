/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    fakeTimers: { now: Date.parse('2026-10-01T12:00:00+09:00') },
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
  },
});

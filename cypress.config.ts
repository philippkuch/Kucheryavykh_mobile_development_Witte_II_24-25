import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://127.0.0.1:8100',
    viewportWidth: 390,
    viewportHeight: 844,
    includeShadowDom: true,
    setupNodeEvents(on, config) {
      
    },
    
  },
});
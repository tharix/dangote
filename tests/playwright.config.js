const { defineConfig } = require('@playwright/test');
const path = require('node:path');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '**/browser.spec.js',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium'
  },
  webServer: {
    command: 'python -m http.server 4173 --bind 127.0.0.1',
    cwd: path.resolve(__dirname, '..'),
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});

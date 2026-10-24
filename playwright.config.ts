import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',use:{baseURL:'http://127.0.0.1:3100',headless:true,launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}},webServer:{command:'npm run dev -- --port 3100',url:'http://127.0.0.1:3100',env:{AI_PROVIDER:'mock'},reuseExistingServer:false},workers:1});

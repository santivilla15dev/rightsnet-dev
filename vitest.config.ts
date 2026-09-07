import {defineConfig} from 'vitest/config';
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL??'postgresql://rightsnet@127.0.0.1:55432/rightsnet_test';
process.env.APP_ENV='sandbox';
process.env.AUTH_PROVIDER='sandbox';
process.env.PAYMENTS_PROVIDER='sandbox';
export default defineConfig({test:{include:['tests/**/*.test.ts'],fileParallelism:false,testTimeout:20000,hookTimeout:30000}});

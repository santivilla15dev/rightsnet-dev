import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ignores:['**/node_modules/**','**/.next/**','**/.local/**','packages/contracts/api.d.ts','**/next-env.d.ts']},js.configs.recommended,...ts.configs.recommended,{files:['**/*.ts','**/*.tsx'],rules:{'@typescript-eslint/no-explicit-any':'error','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_',caughtErrors:'none'}],'@typescript-eslint/no-empty-object-type':'off'}});

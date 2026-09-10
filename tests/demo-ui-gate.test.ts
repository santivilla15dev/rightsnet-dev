import { describe, expect, it } from 'vitest';
import { config } from '../apps/api/src/common/config.js';

describe('Demo UI gate v0.1', () => {
  it('demo_ui off por defecto (producto; CI lo enciende vía env al arrancar)', () => {
    expect(config.demoUiEnabled).toBe(process.env.DEMO_UI_ENABLED === 'true');
  });
});

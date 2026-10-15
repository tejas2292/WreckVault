import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks', // tests point HOME at temp dirs; os.homedir() must see the real env
    testTimeout: 30000,
    env: { WV_SECRET_STORE: 'file' }, // never touch the real Keychain from the general suites
  },
});

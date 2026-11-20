import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hospivo.pos',
  appName: 'hospivo',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;

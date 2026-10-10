import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.jiantu.inspection',
  appName: '检图',
  webDir: 'dist-mobile',
  loggingBehavior: 'none',
  android: { backgroundColor: '#f5f7fb', allowMixedContent: false },
};
export default config;

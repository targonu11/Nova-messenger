export const appId = 'com.nova.messenger';
export const appName = 'Nova';
export const webDir = 'dist';

export const server = {
  cleartext: true,
  androidScheme: 'https',
  hostname: 'localhost',
};

export const android = {
  buildOptions: {
    keystorePath: undefined,
    keystorePassword: undefined,
    keystoreAlias: undefined,
    keystoreAliasPassword: undefined,
  },
  allowMixedContent: true,
  captureInput: true,
  webContentsDebuggingEnabled: true,
};

export const plugins = {
  SplashScreen: {
    launchShowDuration: 2000,
    launchAutoHide: true,
    backgroundColor: '#0a0a0c',
    androidSplashResourceName: 'splash',
    androidScaleType: 'CENTER_CROP',
    showSpinner: false,
  },
};

// Default export keeps compatibility with tooling that uses ESModule import()
const config = {
  appId,
  appName,
  webDir,
  server,
  android,
  plugins,
};

export default config;

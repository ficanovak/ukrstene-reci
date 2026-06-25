/**
 * Jest config for the Expo (React Native) mobile app.
 * Uses the jest-expo preset which wires up the RN/Expo transform + module mocks.
 */
module.exports = {
  preset: 'jest-expo',
  // RN/Expo ship untranspiled ESM in node_modules; allow Babel to transform them.
  // In a hoisted npm-workspaces monorepo these packages live in the ROOT node_modules,
  // so the pattern matches `<root>/node_modules/<pkg>` as well as `mobile/node_modules/<pkg>`.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|nativewind|react-native-svg|react-native-css-interop))',
  ],
};

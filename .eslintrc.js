module.exports = {
  root: true,
  // This tells ESLint to load the config from the package `eslint-config-custom`
  extends: [ "custom" ],
  settings: {
    next: {
      rootDir: [ "apps/*/" ],
    },
  },
  rules: {
    "no-restricted-globals": "off",
    "antfu/if-newline": "off",
    "n/prefer-global/process": "off",
  },
};

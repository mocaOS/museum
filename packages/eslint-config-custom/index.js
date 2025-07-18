const path = require("node:path");

module.exports = {
  extends: [ "@creazy231" ],
  overrides: [
    {
      files: [ "*.vue" ],
      parser: "vue-eslint-parser",
    },
  ],
  rules: {
    "no-restricted-globals": "off",
    "antfu/if-newline": "off",
    "n/prefer-global/process": "off",
    "@typescript-eslint/consistent-type-imports": "off",
    "vue/no-deprecated-slot-attribute": "off",
  },
  settings: {
    "better-tailwindcss": {
      entryPoint: path.resolve(__dirname, "..", "..", "apps", "web", "assets", "css", "tailwind.css"),
    },
  },
};

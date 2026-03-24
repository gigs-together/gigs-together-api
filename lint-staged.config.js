/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
export default {
  '*.{js,ts}': [
    'prettier --cache --cache-location .cache/prettier --write',
    'eslint --cache --cache-location .cache/eslint --fix',
  ],
  '*.{json,md,yml,yaml}': [
    'prettier --cache --cache-location .cache/prettier --write',
  ],
};

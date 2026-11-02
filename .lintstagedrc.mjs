export default {
  '{packages,tools}/**/*.{ts,js,mts}': [
    'eslint --cache --cache-strategy content --fix',
    'prettier --write',
  ],
  '*.{ts,js,mjs,json,yaml,yml}': ['prettier --write'],
};

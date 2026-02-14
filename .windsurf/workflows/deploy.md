---
description: Deploy the Memorix package to npm registry
---
1. Run all tests: `npm test`
2. Check types: `npx tsc --noEmit`
3. Build: `npx tsup`
4. Bump version in package.json
5. Publish: `npm publish`
6. Verify installation: `npx memorix --version`

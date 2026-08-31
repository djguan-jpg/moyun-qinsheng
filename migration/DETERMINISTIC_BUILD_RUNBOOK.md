# Reproducible checkout and build gate

Run these commands serially in every fresh Windows or CI checkout. Stop on the first failure.

```text
git lfs install --local
git lfs fetch origin <exact-commit>
git lfs checkout
npm ci
npm run lfs:preflight
npm test
npm run check
npm run build
```

The preflight rejects pointer stubs and verifies every LFS object's committed pointer size/SHA-256 plus every immutable manifest entry's size/SHA-256. A build that writes `dist` must not overlap another `dist` writer. Tests build twice in a unique temporary outdir, so the full test suite may be scheduled alongside read-only checks without contending with the production `dist` build.

# Brand logo slot

The app renders its logo through `src/components/BrandMark.tsx`, which looks
for **`/logo.png`** first and falls back to the built-in bolt mark.

## Importing the Canva logo

1. Design/export the logo in Canva (square PNG, transparent background works best; 512×512 or larger).
2. Name the file exactly `logo.png`.
3. Drop it in this `public/` folder (next to this README).
4. Rebuild/redeploy — the sidebar, header and landing page pick it up automatically. No code change needed.

The wordmark ("Control Point") and the mini **BETA** badge are rendered in code
next to the image, so they stay crisp at every size.

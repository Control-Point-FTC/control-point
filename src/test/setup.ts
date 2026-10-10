import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// waitFor/findBy default to 1s, which flakes under a full parallel run.
configure({ asyncUtilTimeout: 4000 });

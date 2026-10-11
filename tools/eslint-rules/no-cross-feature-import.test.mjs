import { describe, it } from "node:test";
import path from "node:path";
import { RuleTester } from "eslint";
import { noCrossFeatureImport } from "./no-cross-feature-import.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const srcRoot = path.resolve("/repo/apps/web/src");
const options = [{ srcRoot }];
const file = (...parts) => path.join(srcRoot, ...parts);
const crossFeature = [{ messageId: "crossFeature" }];
const unreadable = [{ messageId: "unreadable" }];

const tester = new RuleTester({ languageOptions: { ecmaVersion: "latest", sourceType: "module" } });

tester.run("no-cross-feature-import", noCrossFeatureImport, {
  valid: [
    { filename: file("features/a/AFeature.tsx"), options, code: "import { x } from './helpers';" },
    { filename: file("features/a/AFeature.tsx"), options, code: "import { x } from '@/features/a/helpers';" },
    { filename: file("features/a/deep/er/Part.tsx"), options, code: "import { x } from '../../helpers';" },
    { filename: file("features/a/AFeature.tsx"), options, code: "import { x } from '@/components/shared/Card';" },
    { filename: file("features/a/AFeature.tsx"), options, code: "import { x } from '../../services/posts-api';" },
    { filename: file("features/a/AFeature.tsx"), options, code: "import { x } from 'react';" },
    { filename: file("features/a/AFeature.tsx"), options, code: "export { x } from './helpers';" },
    { filename: file("features/a/AFeature.tsx"), options, code: "const m = import('./helpers');" },
    // A file outside features/ is not this rule's business.
    { filename: file("components/shared/Card.tsx"), options, code: "import { x } from '../../features/b/BFeature';" },
  ],
  invalid: [
    { filename: file("features/a/AFeature.tsx"), options, code: "import { x } from '../b/BFeature';", errors: crossFeature },
    { filename: file("features/a/AFeature.tsx"), options, code: "import { x } from '@/features/b/BFeature';", errors: crossFeature },
    // Depth: a nested file climbing out to a sibling feature.
    { filename: file("features/a/deep/er/Part.tsx"), options, code: "import { x } from '../../../b/BFeature';", errors: crossFeature },
    // Re-exports.
    { filename: file("features/a/AFeature.tsx"), options, code: "export { x } from '../b/BFeature';", errors: crossFeature },
    { filename: file("features/a/AFeature.tsx"), options, code: "export * from '@/features/b/BFeature';", errors: crossFeature },
    // Dynamic import.
    { filename: file("features/a/AFeature.tsx"), options, code: "const m = import('../b/BFeature');", errors: crossFeature },
    { filename: file("features/a/AFeature.tsx"), options, code: "const m = import('@/features/b/BFeature');", errors: crossFeature },
    // Specifiers that cannot be read.
    { filename: file("features/a/AFeature.tsx"), options, code: "const m = import(`../${name}/BFeature`);", errors: unreadable },
    { filename: file("features/a/AFeature.tsx"), options, code: "const m = import(`@/features/${name}`);", errors: unreadable },
    { filename: file("features/a/AFeature.tsx"), options, code: "const m = import(spec);", errors: unreadable },
  ],
});

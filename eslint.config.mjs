import { builtinModules } from "node:module";
import path from "node:path";
import tseslint from "typescript-eslint";
import nestlyBoundaries from "./tools/eslint-rules/no-cross-feature-import.mjs";

const root = import.meta.dirname;
const webSrc = path.join(root, "apps/web/src");

// Size caps count code lines only: blank lines and comments are skipped, so a
// well-commented file is not penalised. WORKPLAN 7.1 / decisions.md.
const cap = (max) => ["error", { max, skipBlankLines: true, skipComments: true }];

const BROWSER_GLOBALS = ["window", "document", "navigator", "localStorage", "sessionStorage"];
const NODE_GLOBALS = ["process", "Buffer", "__dirname", "__filename", "require", "module"];
const restrictGlobals = (names, what) =>
  names.map((name) => ({ name, message: `${what} must not use '${name}'.` }));

// `globalThis.window`, `self.document` and `globalThis['document']` reach the
// same globals; no-restricted-globals does not see them.
const restrictGlobalObjectAccess = (names, what) =>
  ["globalThis", "self", "window"].flatMap((object) =>
    names.map((property) => ({
      object,
      property,
      message: `${what} must not use '${property}' (not through '${object}' either).`,
    })),
  );

const nodeBuiltins = [
  ...new Set(builtinModules.map((name) => name.replace(/^node:/, ""))),
].flatMap((name) => [name, `node:${name}`]);

// ---- imports -------------------------------------------------------------
// no-restricted-imports does not see `import()`. Every import ban below has a
// twin no-restricted-syntax selector. Neither rule merges across config blocks:
// a later block replaces the earlier one, so every block re-spreads what it needs.

const noServerImport = [
  { group: ["@nestly/server", "@nestly/server/**", "**/apps/server/**", "**/server/src/**", "**/server/api/**"], message: "The web app never imports from the server. They meet only through packages/shared and the HTTP API." },
];
const noWebImport = [
  { group: ["@nestly/web", "@nestly/web/**", "**/apps/web/**", "**/web/src/**"], message: "The server never imports from the web app. They meet only through packages/shared and the HTTP API." },
];
const noReactDom = [
  { group: ["react-dom", "react-dom/**"], message: "Web logic (hooks, services, lib) must not use react-dom (SRS 4.1, portability to React Native)." },
];
const noAppsImport = [
  { group: ["@nestly/web", "@nestly/web/**", "@nestly/server", "@nestly/server/**", "**/apps/**"], message: "packages/shared imports nothing from apps/*." },
  { group: ["react-dom", "react-dom/**"], message: "packages/shared uses no DOM." },
];
const noSharedUi = [
  { group: ["**/features", "**/features/**", "**/services", "**/services/**"], message: "Shared UI (components/) must not import from features/ or services/. Pass data and callbacks in as props." },
];

// esquery regex literals cannot hold '/', so '#' stands for it and becomes '[/]'.
const dynamicImport = (pattern, message) => ({
  selector: `ImportExpression[source.value=/${pattern.replaceAll("#", "[/]")}/]`,
  message,
});

const dynNoServer = dynamicImport("^@nestly#server|apps#server|server#src|server#api", noServerImport[0].message);
const dynNoWeb = dynamicImport("^@nestly#web|apps#web|web#src", noWebImport[0].message);
const dynNoReactDom = dynamicImport("^react-dom", noReactDom[0].message);
const dynNoApps = dynamicImport("^@nestly#(web|server)|(^|#)apps#", noAppsImport[0].message);
const dynNoSharedUi = dynamicImport("(^|#)(features|services)($|#)", noSharedUi[0].message);
const dynSharedNoDom = dynamicImport("^react-dom", noAppsImport[1].message);
const dynNoNode = dynamicImport(
  `^(node:)?(${[...new Set(builtinModules.map((name) => name.replace(/^node:/, "").replaceAll("/", "#")))].join("|")})$`,
  "packages/shared uses no Node built-ins (it must run on web, server and React Native).",
);

// Applies everywhere: a specifier the linter cannot read is a specifier it
// cannot check, so it is not allowed.
const BASE_SYNTAX = [
  {
    selector: "ImportExpression:not([source.type='Literal'])",
    message: "import() takes a string literal, so the import boundaries can be checked.",
  },
  {
    selector: "TSImportEqualsDeclaration[moduleReference.type='TSExternalModuleReference']",
    message: "Use an ES import, not `import x = require()`.",
  },
];

const imports = (...lists) => ({
  "no-restricted-imports": ["error", { patterns: lists.flat() }],
});
const syntax = (...lists) => ({
  "no-restricted-syntax": ["error", ...BASE_SYNTAX, ...lists.flat()],
});

const webLogicRules = {
  ...imports(noServerImport, noReactDom),
  ...syntax(dynNoServer, dynNoReactDom),
  "no-restricted-globals": ["error", ...restrictGlobals(BROWSER_GLOBALS, "Web logic (hooks, services, lib)")],
  "no-restricted-properties": ["error", ...restrictGlobalObjectAccess(BROWSER_GLOBALS, "Web logic (hooks, services, lib)")],
};

const JS_FILES = "{js,jsx,mjs,cjs}";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.vercel/**",
      "exports/**",
      "docs/**",
      ".work/**",
      ".claude/**",
      // Standalone docs tooling with its own package.json. The ESLint rules
      // under tools/eslint-rules/ are linted.
      "tools/*.{js,mjs,cjs}",
    ],
  },
  {
    // Inline `eslint-disable` / `eslint-enable` comments are not honoured:
    // a rule changes in this file or not at all. With --max-warnings 0 an
    // inline directive fails the run.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "error" },
  },

  // ---- plain JavaScript is not allowed in product code ----
  // It is neither typechecked (allowJs is false) nor type-linted, so a .js file
  // there would sit outside every rule below. Fail on any file instead.
  {
    files: [
      `apps/*/src/**/*.${JS_FILES}`,
      `apps/*/api/**/*.${JS_FILES}`,
      `apps/*/tests/**/*.${JS_FILES}`,
      `apps/*/*.${JS_FILES}`,
      `packages/*/src/**/*.${JS_FILES}`,
      `packages/*/tests/**/*.${JS_FILES}`,
      `packages/*/*.${JS_FILES}`,
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "Program", message: "Product code is TypeScript (hard rule 0). Rename this file to .ts or .tsx." },
      ],
    },
  },

  // ---- repo tooling in JavaScript: the config and its own rules ----
  {
    files: ["eslint.config.mjs", "tools/eslint-rules/**/*.mjs"],
    extends: [tseslint.configs.recommended],
    rules: {
      ...syntax(),
      "max-lines": cap(300),
    },
  },

  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: [
          "apps/web/tsconfig.json",
          "apps/web/tsconfig.node.json",
          "apps/server/tsconfig.json",
          "packages/shared/tsconfig.tests.json",
        ],
        tsconfigRootDir: root,
      },
    },
    rules: {
      // Hard rule 0: no any, no ts-comments, no casts.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-expect-error": true,
          "ts-check": false,
        },
      ],
      // 'never' forbids `x as T` and `<T>x`; `as const` stays allowed.
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      // `x!` is a cast the compiler cannot check.
      "@typescript-eslint/no-non-null-assertion": "error",
      ...syntax(),
    },
  },

  // ---- apps/web: size caps ----
  {
    files: [
      "apps/web/src/pages/**/*.{ts,tsx}",
      "apps/web/src/features/**/*.{ts,tsx}",
      "apps/web/src/components/**/*.{ts,tsx}",
    ],
    rules: { "max-lines": cap(600) },
  },
  {
    // Hooks: the app-wide hooks/ folder, and use-*.ts files inside a Feature.
    files: ["apps/web/src/hooks/**/*.{ts,tsx}", "apps/web/src/**/use-*.{ts,tsx}"],
    rules: { "max-lines": cap(300) },
  },
  { files: ["apps/web/src/services/**/*.{ts,tsx}"], rules: { "max-lines": cap(400) } },
  { files: ["apps/web/src/lib/**/*.{ts,tsx}"], rules: { "max-lines": cap(300) } },

  // ---- apps/web: import boundaries ----
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: { ...imports(noServerImport), ...syntax(dynNoServer) },
  },
  {
    files: ["apps/web/src/features/**/*.{ts,tsx}"],
    plugins: { nestly: nestlyBoundaries },
    rules: {
      ...imports(noServerImport),
      ...syntax(dynNoServer),
      "nestly/no-cross-feature-import": ["error", { srcRoot: webSrc }],
    },
  },
  {
    // Shared UI (components/**) knows nothing of Features or services.
    files: ["apps/web/src/components/**/*.{ts,tsx}"],
    rules: {
      ...imports(noServerImport, noSharedUi),
      ...syntax(dynNoServer, dynNoSharedUi),
    },
  },
  {
    // Web logic stays portable to React Native: no react-dom, window or
    // document. Comes after the Features block, which it overrides for use-*
    // files, so it repeats the server ban. The cross-feature rule has its own
    // name and is not replaced.
    files: [
      "apps/web/src/hooks/**/*.{ts,tsx}",
      "apps/web/src/services/**/*.{ts,tsx}",
      "apps/web/src/lib/**/*.{ts,tsx}",
      "apps/web/src/**/use-*.{ts,tsx}",
      "apps/web/src/app/**/*.ts",
    ],
    rules: webLogicRules,
  },

  // ---- apps/server ----
  { files: ["apps/server/src/routes/**/*.ts"], rules: { "max-lines": cap(200) } },
  { files: ["apps/server/src/services/**/*.ts"], rules: { "max-lines": cap(400) } },
  { files: ["apps/server/src/repositories/**/*.ts"], rules: { "max-lines": cap(400) } },
  { files: ["apps/server/**/*.ts"], rules: { ...imports(noWebImport), ...syntax(dynNoWeb) } },

  // ---- packages/shared: no apps/*, no DOM, no Node ----
  {
    files: ["packages/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: nodeBuiltins.map((name) => ({
            name,
            message: "packages/shared uses no Node built-ins (it must run on web, server and React Native).",
          })),
          patterns: noAppsImport,
        },
      ],
      ...syntax(dynNoApps, dynSharedNoDom, dynNoNode),
      "no-restricted-globals": [
        "error",
        ...restrictGlobals([...BROWSER_GLOBALS, ...NODE_GLOBALS], "packages/shared"),
      ],
      "no-restricted-properties": [
        "error",
        ...restrictGlobalObjectAccess([...BROWSER_GLOBALS, ...NODE_GLOBALS], "packages/shared"),
      ],
    },
  },
);

import path from "node:path";

// A Feature never imports another Feature (conventions.md, "Web architecture").
// Resolves relative imports and the `@/` alias to a path, so it holds at any
// folder depth, which a plain no-restricted-imports glob cannot do.

const isInside = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};

const featureOf = (featuresRoot, absolutePath) => {
  if (!isInside(featuresRoot, absolutePath)) return null;
  return path.relative(featuresRoot, absolutePath).split(path.sep)[0] ?? null;
};

/** @type {import("eslint").Rule.RuleModule} */
export const noCrossFeatureImport = {
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: { srcRoot: { type: "string" } },
        required: ["srcRoot"],
        additionalProperties: false,
      },
    ],
    messages: {
      crossFeature:
        "A Feature must not import another Feature ('{{ from }}' imports '{{ to }}'). Move what both need to components/shared, components/domain or a service.",
      unreadable:
        "This import() specifier cannot be read statically, so it cannot be checked against the Feature boundary. Use a string literal.",
    },
  },
  create(context) {
    const option = context.options[0];
    const srcRoot = path.resolve(option.srcRoot);
    const featuresRoot = path.join(srcRoot, "features");
    const own = featureOf(featuresRoot, path.resolve(context.filename));
    if (own === null) return {};

    const check = (node, specifier) => {
      if (typeof specifier !== "string") return;
      let target = null;
      if (specifier.startsWith(".")) {
        target = path.resolve(path.dirname(context.filename), specifier);
      } else if (specifier.startsWith("@/")) {
        target = path.join(srcRoot, specifier.slice(2));
      }
      if (target === null) return;
      const other = featureOf(featuresRoot, target);
      if (other !== null && other !== own) {
        context.report({ node, messageId: "crossFeature", data: { from: own, to: other } });
      }
    };

    return {
      ImportDeclaration: (node) => check(node, node.source.value),
      ExportAllDeclaration: (node) => check(node, node.source.value),
      ExportNamedDeclaration: (node) => {
        if (node.source) check(node, node.source.value);
      },
      ImportExpression: (node) => {
        if (node.source.type === "Literal") {
          check(node, node.source.value);
        } else {
          // Template literals and expressions cannot be resolved to a path.
          context.report({ node, messageId: "unreadable" });
        }
      },
    };
  },
};

export default { rules: { "no-cross-feature-import": noCrossFeatureImport } };

// Design consistency gates (decisions.md, "Design consistency without a design agent"):
// no physical direction classes, no arbitrary Tailwind values, no hex outside the
// token source, no Radix import outside components/ui. Plain strings are checked,
// so a class built in a template, a cva() call or a JSX attribute is all one case.

import path from "node:path";

// ---- the physical class list: stored once, from the rtl-hebrew skill ("Forbidden", 1) ----
// ml- mr- pl- pr-, left- right-, text-left/right, rounded-l/r (and the corner forms),
// border-l/r. The logical twins are ms- me- ps- pe- start- end- text-start/end
// rounded-s/e rounded-ss/se/es/ee border-s/e.
export const PHYSICAL_CLASS =
  /^(?:-?[mp][lr]-|-?(?:left|right)-|text-(?:left|right)$|rounded-(?:[lr]|tl|tr|bl|br)(?:-|$)|border-[lr](?:-|$))/;

const ARBITRARY_VALUE = /^!?-?[a-z][a-z0-9-]*-\[[^\]]*\]!?$/;
const ARBITRARY_PROPERTY = /^!?\[[a-z-]+:[^\]]*\]!?$/;
// Variants that read an attribute, not a value: allowed everywhere (spec Q1).
const STATE_VARIANT = /^(?:group-|peer-)?(?:data|aria)-/;
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/g;
// A fixture or file with this suffix is a whole .css/.svg file, see textProcessor.
const TEXT_BLOCK = ".nestlytext";

// Splits on ':' outside [...], so `[&:hover]:ml-4` has the variants ['[&:hover]'].
const splitTopLevel = (token) => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of token) {
    if (ch === "[") depth++;
    if (ch === "]") depth = Math.max(0, depth - 1);
    if (ch === ":" && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
};

const stringsOf = (node) => {
  if (node.type === "Literal" && typeof node.value === "string") return [node.value];
  if (node.type === "TemplateElement") return [node.value.cooked ?? node.value.raw];
  return [];
};

const rule = (messages, visit) => ({
  meta: { type: "problem", schema: [], messages },
  create(context) {
    const report = (node, messageId, data) => context.report({ node, messageId, data });
    const handler = (node) => {
      for (const text of stringsOf(node)) visit(text, (id, data) => report(node, id, data), context);
    };
    return { Literal: handler, TemplateElement: handler };
  },
});

const noPhysicalDirection = rule(
  { physical: "'{{ token }}' is a physical direction class. Use the logical one (ms-/me-/ps-/pe-/start-/end-/text-start/rounded-s/border-s)." },
  (text, report) => {
    for (const token of text.split(/\s+/)) {
      const utility = splitTopLevel(token).at(-1).replace(/^!/, "");
      if (PHYSICAL_CLASS.test(utility)) report("physical", { token });
    }
  },
);

const noArbitraryValue = rule(
  {
    arbitrary: "'{{ token }}' is an arbitrary Tailwind value. Use a token or a scale step.",
    selectorVariant: "'{{ token }}' uses a [&…] selector variant, which is allowed only inside components/ui.",
  },
  (text, report, context) => {
    const inUi = /[\\/]components[\\/]ui[\\/]/.test(context.filename);
    for (const token of text.split(/\s+/)) {
      const parts = splitTopLevel(token);
      const utility = parts.at(-1);
      if (ARBITRARY_VALUE.test(utility) || ARBITRARY_PROPERTY.test(utility)) report("arbitrary", { token });
      for (const variant of parts.slice(0, -1)) {
        if (STATE_VARIANT.test(variant) || !variant.includes("[")) continue;
        if (variant.startsWith("[&") && inUi) continue;
        report(variant.startsWith("[&") ? "selectorVariant" : "arbitrary", { token });
      }
    }
  },
);

const lineColumn = (text, index) => {
  const before = text.slice(0, index).split("\n");
  return { line: before.length, column: before.at(-1).length };
};

const noHex = {
  meta: {
    type: "problem",
    schema: [],
    messages: { hex: "'{{ value }}' is a hex colour outside the token source. Use a semantic token (bg-primary, var(--color-primary))." },
  },
  create(context) {
    const wholeFile = context.filename.endsWith(TEXT_BLOCK);
    const handler = (node) => {
      for (const text of stringsOf(node)) {
        for (const match of text.matchAll(HEX)) {
          const data = { value: match[0] };
          if (wholeFile) context.report({ loc: { start: lineColumn(text, match.index), end: lineColumn(text, match.index + match[0].length) }, messageId: "hex", data });
          else context.report({ node, messageId: "hex", data });
        }
      }
    };
    return { Literal: handler, TemplateElement: handler };
  },
};

const RADIX = /^(?:@radix-ui\/.+|radix-ui(?:\/.*)?)$/;

const noRadixOutsideUi = {
  meta: {
    type: "problem",
    schema: [],
    messages: { radix: "Radix is imported only inside apps/web/src/components/ui. Import the wrapped primitive instead." },
  },
  create(context) {
    const check = (node) => {
      const source = node.source;
      if (source?.type === "Literal" && typeof source.value === "string" && RADIX.test(source.value)) {
        context.report({ node, messageId: "radix" });
      }
    };
    return {
      ImportDeclaration: check,
      ImportExpression: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};

// A .css or .svg file has no AST of its own. The processor hands the whole text to the
// rules above as one string literal, so the hex rule reads it like any other string.
const textProcessor = {
  meta: { name: "nestly-text" },
  preprocess: (text, filename) => [
    { text: `export default ${JSON.stringify(text)};`, filename: `${path.basename(filename)}${TEXT_BLOCK}` },
  ],
  postprocess: (messages) => messages.flat(),
  supportsAutofix: false,
};

export default {
  rules: {
    "no-physical-direction": noPhysicalDirection,
    "no-arbitrary-value": noArbitraryValue,
    "no-hex": noHex,
    "no-radix-outside-ui": noRadixOutsideUi,
  },
  processors: { text: textProcessor },
};

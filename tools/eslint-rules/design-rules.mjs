// Design consistency gates (decisions.md, "Design consistency without a design agent"):
// no physical direction classes, no arbitrary Tailwind values, no hex outside the
// token source, no Radix import outside components/ui. Plain strings are checked,
// so a class built in a template, a cva() call or a JSX attribute is all one case.

import path from "node:path";

// ---- the physical class list: stored once, from the rtl-hebrew skill ("Forbidden", 1) ----
// ml- mr- pl- pr-, left- right-, text-left/right, rounded-l/r (and the corner forms), border-l/r,
// float- and clear- left/right, scroll-m/p l/r, origin-, object-, bg- left/right positions, translate-x-.
// The logical twins are ms- me- ps- pe- start- end- text-start/end rounded-s/e border-s/e float-start/end.
// space-x- is not listed: Tailwind 4 spaces by logical margin, so it already mirrors.
export const PHYSICAL_CLASS = new RegExp(
  "^(?:" +
    [
      "-?[mp][lr]-",
      "-?(?:left|right)-",
      "text-(?:left|right)$",
      "rounded-(?:[lr]|tl|tr|bl|br)(?:-|$)",
      "border-[lr](?:-|$)",
      "(?:float|clear)-(?:left|right)$",
      "-?scroll-[mp][lr]-",
      "origin-(?:(?:top|bottom)-)?(?:left|right)$",
      "(?:object|bg)-(?:(?:top|bottom)-)?(?:left|right)(?:-(?:top|bottom))?$",
      "-?translate-x-",
    ].join("|") +
    ")",
);

// The same properties written as inline style keys and as CSS declarations.
const PHYSICAL_STYLE_KEY =
  /^(?:margin|padding)(?:Left|Right)$|^border(?:Left|Right)(?:Width|Color|Style)?$|^border(?:Top|Bottom)(?:Left|Right)Radius$|^(?:left|right)$/;
const PHYSICAL_STYLE_VALUE_KEY = /^(?:textAlign|float|clear)$/;
const PHYSICAL_CSS = /(?<![\w-])(?:(?:margin|padding)-(?:left|right)|border-(?:left|right)(?:-(?:width|color|style))?|border-(?:top|bottom)-(?:left|right)-radius|left|right)\s*:|(?<![\w-])(?:text-align|float|clear)\s*:\s*(?:left|right)\b/;
const COLOUR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/;

const ARBITRARY_VALUE = /^!?-?[a-z][a-z0-9-]*-\[[^\]]*\]!?$/;
const ARBITRARY_PROPERTY = /^!?\[[a-z-]+:[^\]]*\]!?$/;
// Variants that read an attribute, not a value: allowed everywhere (spec Q1).
const STATE_VARIANT = /^(?:group-|peer-)?(?:data|aria)-/;
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/;
const COLOUR = new RegExp(`${HEX.source}|${COLOUR_FUNCTION.source}`, "g");
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

const noArbitraryValue = rule(
  {
    arbitrary: "'{{ token }}' is an arbitrary Tailwind value. Use a token or a scale step.",
    selectorVariant: "'{{ token }}' uses a [&…] selector variant, which is allowed only inside components/ui.",
  },
  (text, report, context) => {
    const inUi = /apps[\\/]web[\\/]src[\\/]components[\\/]ui[\\/]/.test(context.filename);
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

const wholeFileLoc = (text, index, length) => ({
  start: lineColumn(text, index),
  end: lineColumn(text, index + length),
});

const keyName = (property) =>
  property.key.type === "Identifier" && !property.computed ? property.key.name
    : property.key.type === "Literal" ? String(property.key.value) : "";

const noPhysicalDirection = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      physical: "'{{ token }}' is a physical direction class. Use the logical one (ms-/me-/ps-/pe-/start-/end-/text-start/rounded-s/border-s).",
      styleKey: "The style '{{ token }}' is a physical direction. Use the logical property (marginInlineStart, paddingInlineEnd, insetInlineStart, textAlign: 'start').",
      css: "'{{ token }}' is a physical direction in CSS. Use the logical property (margin-inline-start, inset-inline-start, text-align: start).",
    },
  },
  create(context) {
    const wholeFile = context.filename.endsWith(TEXT_BLOCK);
    const inStyleAttribute = (node) =>
      context.sourceCode.getAncestors(node).some((a) => a.type === "JSXAttribute" && a.name.name === "style");
    const strings = (node) => {
      for (const text of stringsOf(node)) {
        if (wholeFile) {
          for (const match of text.matchAll(new RegExp(PHYSICAL_CSS, "g"))) {
            context.report({ loc: wholeFileLoc(text, match.index, match[0].length), messageId: "css", data: { token: match[0].trim() } });
          }
          continue;
        }
        for (const token of text.split(/\s+/)) {
          const utility = splitTopLevel(token).at(-1).replace(/^!/, "");
          if (PHYSICAL_CLASS.test(utility)) context.report({ node, messageId: "physical", data: { token } });
        }
      }
    };
    return {
      Literal: strings,
      TemplateElement: strings,
      Property(node) {
        if (wholeFile || !inStyleAttribute(node)) return;
        const name = keyName(node);
        const physicalKey = PHYSICAL_STYLE_KEY.test(name);
        const physicalValue =
          PHYSICAL_STYLE_VALUE_KEY.test(name) &&
          node.value.type === "Literal" &&
          (node.value.value === "left" || node.value.value === "right");
        if (physicalKey || physicalValue) {
          context.report({ node, messageId: "styleKey", data: { token: physicalValue ? name + ": " + node.value.value : name } });
        }
      },
    };
  },
};

const noHex = {
  meta: {
    type: "problem",
    schema: [],
    messages: { hex: "'{{ value }}' is a literal colour (hex or colour function) outside the token source. Use a semantic token (bg-primary, var(--color-primary))." },
  },
  create(context) {
    const wholeFile = context.filename.endsWith(TEXT_BLOCK);
    const handler = (node) => {
      for (const text of stringsOf(node)) {
        for (const match of text.matchAll(COLOUR)) {
          const data = { value: match[0] };
          if (wholeFile) context.report({ loc: wholeFileLoc(text, match.index, match[0].length), messageId: "hex", data });
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

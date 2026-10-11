// Copy gate (NFR-USAB-003, ux-copy-he "Forbidden" 1): no gender slash form in a string or in
// JSX text, such as "את/ה" or "מלא/י". The one exception is "ו/או" ("and/or"), which is not a
// gender form.

const HEBREW = "\u0590-\u05FF";
const GENDER_SLASH = new RegExp(`[${HEBREW}]/[${HEBREW}]`);
const AND_OR = new RegExp(`(?<![${HEBREW}])ו/או(?![${HEBREW}])`, "g");

const noGenderSlash = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      slash: "'{{ text }}' is a gender slash form. Use a neutral phrasing (ux-copy-he); 'ו/או' is the only allowed slash.",
    },
  },
  create(context) {
    const check = (node, text) => {
      const stripped = text.replace(AND_OR, "  ");
      const match = GENDER_SLASH.exec(stripped);
      if (match) context.report({ node, messageId: "slash", data: { text: match[0] } });
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};

export default { rules: { "no-gender-slash": noGenderSlash } };

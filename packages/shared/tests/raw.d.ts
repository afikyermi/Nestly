// Vite loads `?raw` imports as strings, so tests can read docs/design/tokens.md without a Node API.
declare module '*.md?raw' {
  const content: string;
  export default content;
}

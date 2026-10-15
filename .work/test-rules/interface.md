# interface — test rules CI side
- `e2e/visual-screens.ts` (to be created from visual-draft.md): `SCREENS: Screen[]`, `Screen = StoryScreen{kind:'story',id} | AppScreen{kind:'app',route,state}`.
- `e2e/visual.visual.spec.ts`: tests named `visual: <name> @phone|desktop`; baselines `e2e/__screenshots__/<name>-<phone|desktop>.png`.
- Playwright projects: `chrome`, `edge` (edge ignores `*.visual.spec.ts`). Config: `updateSnapshots: 'none'`, `maxDiffPixelRatio: 0.002`.
- Workflow jobs: `browser` (matrix project [chrome], shard [1,2]); `browser-edge` (matrix shard [1,2], not on pull_request). `update-baselines.yml` job `baselines`, artifact `visual-baselines`.

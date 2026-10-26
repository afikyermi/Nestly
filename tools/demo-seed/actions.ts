// Every step kind's handler, in one map (the account step is the runner's own).
import { contentHandlers } from './actions-content.ts';
import { marketHandlers } from './actions-market.ts';
import { peopleHandlers } from './actions-people.ts';
import type { Step } from './plan.ts';
import type { Handler } from './runner.ts';

export const actionHandlers: Partial<Record<Step['kind'], Handler>> = { ...peopleHandlers, ...contentHandlers, ...marketHandlers };

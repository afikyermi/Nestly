import type { Meta, StoryObj } from '@storybook/react-vite';
import type { OwnChild, OwnJourneys } from '@nestly/shared';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { CHILD_ERROR_TEXTS, CHILDREN_LIMIT_TEXT, dueDateErrorTexts } from '@/lib/child-fields';
import { JourneysContent } from './JourneysContent';
import { ACTION_FAILED_TEXT, EMPTY_CHILD_FORM, EMPTY_DUE_DATE, LOAD_FAILED_TEXT, SAVE_FAILED_TEXT } from './journeys-form';

// The "המסע שלי" section (F2.2a, F2.2b) in each of its states, drawn from props alone, as it sits in the shell's `main` under the profile: no
// server, no timing, so the visual baselines and axe see exactly one state each (e2e/visual-screens.ts).
function Screen(props: Parameters<typeof JourneysContent>[0]) {
  return (
    <main className="px-4 py-5">
      <JourneysContent {...props} />
    </main>
  );
}

const meta = {
  title: 'features/journeys/JourneysContent',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

const noa: OwnChild = { id: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a01', name: 'נועה', sex: 'girl', birthDate: '2023-05-04' };
const itay: OwnChild = { id: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a02', name: 'איתי', sex: 'boy', birthDate: '2025-01-10' };

// c1: pregnant with a due date, has_child, and two children by slot.
const family: OwnJourneys = {
  journeys: [
    { id: '3c9e1b40-0d7a-4f55-8e21-6b0a9f4d2c01', stage: 'pregnant', dueDate: '2027-03-01' },
    { id: '3c9e1b40-0d7a-4f55-8e21-6b0a9f4d2c02', stage: 'has_child', dueDate: null },
  ],
  children: [noa, itay],
};

const planning: OwnJourneys = { journeys: [{ id: '3c9e1b40-0d7a-4f55-8e21-6b0a9f4d2c03', stage: 'planning', dueDate: null }], children: [] };

const SEXES = ['girl', 'boy', 'unknown'] as const;
const ten: OwnJourneys = {
  journeys: [{ id: '3c9e1b40-0d7a-4f55-8e21-6b0a9f4d2c04', stage: 'has_child', dueDate: null }],
  children: ['נועה', 'איתי', 'מאיה', 'יונתן', 'תמר', 'Daniel', 'שירה', 'אורי', 'ליה', 'עומר'].map((name, index) => ({
    id: `7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8b${String(index).padStart(2, '0')}`,
    name,
    sex: SEXES[index % 3] ?? 'unknown',
    birthDate: `20${String(10 + index).padStart(2, '0')}-0${(index % 9) + 1}-1${index % 9}`,
  })),
};

const filled = { name: 'רוני', sex: 'unknown', birthDate: { day: '12', month: '8', year: '2026' } };

export const JourneyView: Story = { args: { view: { kind: 'loaded', data: family, saved: false, form: null } } };

export const JourneyViewNoDueDate: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: { journeys: [{ id: '3c9e1b40-0d7a-4f55-8e21-6b0a9f4d2c05', stage: 'pregnant', dueDate: null }], children: [] },
      saved: false,
      form: null,
    },
  },
};

export const JourneyViewEmpty: Story = { args: { view: { kind: 'loaded', data: planning, saved: false, form: null } } };

export const Saved: Story = { args: { view: { kind: 'loaded', data: family, saved: true, form: null } } };

export const Loading: Story = { args: { view: { kind: 'loading' } } };

export const JourneyLoadFailed: Story = { args: { view: { kind: 'load-failed', message: LOAD_FAILED_TEXT } } };

export const AccountStopped: Story = { args: { view: { kind: 'load-failed', message: STOPPED_TEXT } } };

export const ChildForm: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: family,
      saved: false,
      form: { kind: 'child', target: { mode: 'add' }, values: EMPTY_CHILD_FORM, errors: {}, saving: false, failure: null },
    },
  },
};

export const ChildFormEdit: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: family,
      saved: false,
      form: {
        kind: 'child',
        target: { mode: 'edit', childId: noa.id },
        values: { name: 'נועה', sex: 'girl', birthDate: { day: '04', month: '05', year: '2023' } },
        errors: {},
        saving: false,
        failure: null,
      },
    },
  },
};

export const ChildFormErrors: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: family,
      saved: false,
      form: {
        kind: 'child',
        target: { mode: 'add' },
        values: { name: '   ', sex: '', birthDate: { day: '31', month: '2', year: '' } },
        errors: {
          name: CHILD_ERROR_TEXTS.child_name_required,
          sex: CHILD_ERROR_TEXTS.child_sex_required,
          birthDate: CHILD_ERROR_TEXTS.birth_date_required,
        },
        saving: false,
        failure: null,
      },
    },
  },
};

export const ChildrenLimit: Story = { args: { view: { kind: 'loaded', data: ten, saved: false, form: null } } };

export const Saving: Story = {
  args: {
    view: { kind: 'loaded', data: family, saved: false, form: { kind: 'child', target: { mode: 'add' }, values: filled, errors: {}, saving: true, failure: null } },
  },
};

export const JourneySaveFailed: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: family,
      saved: false,
      form: { kind: 'child', target: { mode: 'add' }, values: filled, errors: {}, saving: false, failure: SAVE_FAILED_TEXT },
    },
  },
};

// F2.2b1 c14: the pregnancy's due-date form, filled from the stored date (in place of its row's action, under the journeys).
const pregnancyId = '3c9e1b40-0d7a-4f55-8e21-6b0a9f4d2c01';
export const PregnancyForm: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: family,
      saved: false,
      form: {
        kind: 'pregnancy',
        target: { mode: 'edit', journeyId: pregnancyId },
        values: { day: '01', month: '03', year: '2027' },
        error: null,
        saving: false,
        failure: null,
      },
    },
  },
};

// c14: a partial date after the first "שמירה". A fixed "today" keeps the range text stable for the baseline.
export const PregnancyFormErrors: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: family,
      saved: false,
      form: {
        kind: 'pregnancy',
        target: { mode: 'edit', journeyId: pregnancyId },
        values: { day: '01', month: '', year: '2027' },
        error: dueDateErrorTexts('2026-10-17').due_date_partial,
        saving: false,
        failure: null,
      },
    },
  },
};

// c15: has_child only — "הוספת הריון" is offered under "הוספת ילד".
const childOnly: OwnJourneys = { journeys: [{ id: '3c9e1b40-0d7a-4f55-8e21-6b0a9f4d2c02', stage: 'has_child', dueDate: null }], children: [noa] };
export const JourneyViewAddPregnancy: Story = { args: { view: { kind: 'loaded', data: childOnly, saved: false, form: null } } };

// c15: the add form, empty (a due date is optional), in place of "הוספת הריון".
export const PregnancyFormAdd: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: childOnly,
      saved: false,
      form: { kind: 'pregnancy', target: { mode: 'add' }, values: EMPTY_DUE_DATE, error: null, saving: false, failure: null },
    },
  },
};

// F2.2b2 c21 (DR-6 A): no journey left — the sentence, with "הוספת ילד" and "הוספת הריון".
const none: OwnJourneys = { journeys: [], children: [] };
export const JourneyViewNone: Story = { args: { view: { kind: 'loaded', data: none, saved: false, form: null } } };

// c16, c26: the confirmation before removing a child, named by its question, over the unchanged view; focus on "ביטול".
export const JourneyConfirm: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: family,
      saved: false,
      form: { kind: 'confirm', target: { action: 'remove-child', childId: noa.id }, saving: false, failure: null },
    },
  },
};

// c16: ending the pregnancy (DR-2r: no reason is asked).
export const JourneyConfirmEnd: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: family,
      saved: false,
      form: { kind: 'confirm', target: { action: 'end-pregnancy', journeyId: pregnancyId }, saving: false, failure: null },
    },
  },
};

// c16, c23 (DR-3 A): "הוספת הריון" while planning — the confirmation line before the pregnancy form.
export const JourneyConfirmPlanning: Story = {
  args: {
    view: { kind: 'loaded', data: planning, saved: false, form: { kind: 'confirm', target: { action: 'end-planning' }, saving: false, failure: null } },
  },
};

// c25: the confirmed removal failed (5xx or network): the dialog stays open with the alert, the child still shown.
export const JourneyConfirmFailed: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: family,
      saved: false,
      form: { kind: 'confirm', target: { action: 'remove-child', childId: noa.id }, saving: false, failure: ACTION_FAILED_TEXT },
    },
  },
};

// c22 (DR-2 A): "הלידה התרחשה" opens the child form, empty, under the journeys.
export const BirthForm: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: family,
      saved: false,
      form: { kind: 'child', target: { mode: 'birth', journeyId: pregnancyId }, values: EMPTY_CHILD_FORM, errors: {}, saving: false, failure: null },
    },
  },
};

// c22: ten children stored — the birth is refused (409), the pregnancy kept, the form shows the c6 text.
export const BirthFormFull: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: { journeys: [{ id: pregnancyId, stage: 'pregnant', dueDate: '2027-03-01' }, ...ten.journeys], children: ten.children },
      saved: false,
      form: {
        kind: 'child',
        target: { mode: 'birth', journeyId: pregnancyId },
        values: filled,
        errors: {},
        saving: false,
        failure: CHILDREN_LIMIT_TEXT,
      },
    },
  },
};

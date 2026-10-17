import type { Meta, StoryObj } from '@storybook/react-vite';
import type { OwnChild, OwnJourneys } from '@nestly/shared';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { CHILD_ERROR_TEXTS } from '@/lib/child-fields';
import { JourneysContent } from './JourneysContent';
import { EMPTY_CHILD_FORM, LOAD_FAILED_TEXT, SAVE_FAILED_TEXT } from './journeys-form';

// The "המסע שלי" section (F2.2a) in each of its states, drawn from props alone, as it sits in the shell's `main` under the profile: no
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
      form: { target: { mode: 'add' }, values: EMPTY_CHILD_FORM, errors: {}, saving: false, failure: null },
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
    view: { kind: 'loaded', data: family, saved: false, form: { target: { mode: 'add' }, values: filled, errors: {}, saving: true, failure: null } },
  },
};

export const JourneySaveFailed: Story = {
  args: {
    view: {
      kind: 'loaded',
      data: family,
      saved: false,
      form: { target: { mode: 'add' }, values: filled, errors: {}, saving: false, failure: SAVE_FAILED_TEXT },
    },
  },
};

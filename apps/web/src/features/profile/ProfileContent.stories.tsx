import type { Meta, StoryObj } from '@storybook/react-vite';
import { FULL_NAME_REQUIRED_TEXT } from '@/lib/profile-fields';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { ProfileContent } from './ProfileContent';
import { LOAD_FAILED_TEXT, SAVE_FAILED_TEXT } from './profile-form';

// The profile screen (F2.1) in each of its states, drawn from props alone, as it sits in the shell's `main`: no server, no timing, so
// the visual baselines and axe see exactly one state each (e2e/visual-screens.ts).
function Screen(props: Parameters<typeof ProfileContent>[0]) {
  return (
    <main className="px-4 py-5">
      <ProfileContent {...props} />
    </main>
  );
}

const meta = {
  title: 'features/profile/ProfileContent',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

const dana = { fullName: 'דנה כהן', parentGender: 'woman' } as const;

export const View: Story = { args: { view: { kind: 'view', profile: dana, saved: false } } };

export const ViewNotAnswered: Story = { args: { view: { kind: 'view', profile: { fullName: 'דנה כהן', parentGender: null }, saved: false } } };

export const ViewPreferNotToSay: Story = {
  args: { view: { kind: 'view', profile: { fullName: 'Dana Cohen', parentGender: 'prefer_not_to_say' }, saved: false } },
};

export const Saved: Story = { args: { view: { kind: 'view', profile: { fullName: 'רון לוי', parentGender: 'man' }, saved: true } } };

export const Loading: Story = { args: { view: { kind: 'loading' } } };

export const LoadFailed: Story = { args: { view: { kind: 'load-failed', message: LOAD_FAILED_TEXT } } };

export const AccountStopped: Story = { args: { view: { kind: 'load-failed', message: STOPPED_TEXT } } };

export const Edit: Story = {
  args: { view: { kind: 'edit', values: { fullName: 'דנה כהן', parentGender: 'woman' }, errors: {}, saving: false, failure: null } },
};

export const EditErrors: Story = {
  args: {
    view: { kind: 'edit', values: { fullName: '   ', parentGender: '' }, errors: { fullName: FULL_NAME_REQUIRED_TEXT }, saving: false, failure: null },
  },
};

export const Saving: Story = {
  args: { view: { kind: 'edit', values: { fullName: 'רון לוי', parentGender: 'man' }, errors: {}, saving: true, failure: null } },
};

export const SaveFailed: Story = {
  args: { view: { kind: 'edit', values: { fullName: 'רון לוי', parentGender: 'man' }, errors: {}, saving: false, failure: SAVE_FAILED_TEXT } },
};

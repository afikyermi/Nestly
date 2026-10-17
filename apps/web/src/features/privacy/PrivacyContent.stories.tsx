import type { Meta, StoryObj } from '@storybook/react-vite';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { PrivacyContent } from './PrivacyContent';
import { LOAD_FAILED_TEXT, SAVE_FAILED_TEXT } from './privacy-texts';

// The privacy settings section (F2.3a) in each of its states, drawn from props alone, as it sits in Settings inside the shell's
// `main`: no server, no timing, so the visual baselines and axe see exactly one state each (e2e/visual-screens.ts).
function Screen(props: Parameters<typeof PrivacyContent>[0]) {
  return (
    <main className="px-4 py-5">
      <PrivacyContent {...props} />
    </main>
  );
}

const meta = {
  title: 'features/privacy/PrivacyContent',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaults = { profileVisibility: 'open', isEmptyJourneySentenceShown: true, isChildBirthdayShared: true } as const;
const changed = { profileVisibility: 'restricted', isEmptyJourneySentenceShown: false, isChildBirthdayShared: false } as const;

/** c1: an account with the defaults (Open, sentence shown, birthday on). */
export const Defaults: Story = { args: { view: { kind: 'form', values: defaults, saving: false, failure: null, saved: false } } };

export const Changed: Story = { args: { view: { kind: 'form', values: changed, saving: false, failure: null, saved: false } } };

export const Saving: Story = { args: { view: { kind: 'form', values: changed, saving: true, failure: null, saved: false } } };

export const Saved: Story = { args: { view: { kind: 'form', values: changed, saving: false, failure: null, saved: true } } };

/** c4: the save failed; the choices are kept. */
export const SaveFailed: Story = {
  args: { view: { kind: 'form', values: changed, saving: false, failure: SAVE_FAILED_TEXT, saved: false } },
};

export const Loading: Story = { args: { view: { kind: 'loading' } } };

/** c4: GET failed. */
export const LoadFailed: Story = { args: { view: { kind: 'load-failed', message: LOAD_FAILED_TEXT } } };

export const AccountStopped: Story = { args: { view: { kind: 'load-failed', message: STOPPED_TEXT } } };

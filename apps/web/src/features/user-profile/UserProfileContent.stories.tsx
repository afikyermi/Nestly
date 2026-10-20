import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import type { ProfileView } from '@nestly/shared';
import { STOPPED_TEXT } from '@/lib/auth-texts';
import { BLOCK_FAILED_TEXT } from '@/lib/block-texts';
import { ACTION_FAILED_TEXT, FRIEND_GONE_TEXT, GONE_TEXT } from '@/lib/friend-texts';
import { UserProfileContent } from './UserProfileContent';
import { LOAD_FAILED_TEXT } from './user-profile-texts';

// Another person's profile (F2.4c2) in each of its states, drawn from props alone, as it sits in the shell's `main`: no server, no
// timing, so the visual baselines and axe see exactly one state each (e2e/visual-screens.ts). Links need a router.
function Screen(props: Parameters<typeof UserProfileContent>[0]) {
  return (
    <MemoryRouter>
      <main className="px-4 py-5">
        <UserProfileContent {...props} />
      </main>
    </MemoryRouter>
  );
}

const meta = {
  title: 'features/user-profile/UserProfileContent',
  component: Screen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

const people = [
  { userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a01', fullName: 'דנה כהן' },
  { userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a02', fullName: 'Avi Mizrahi' },
  { userId: '7a1f0c52-5a0e-4c39-9d47-1f7c2d5e8a03', fullName: 'מירי אברהם' },
];

// An Open profile as a non-Friend sees it: gender, the count, the ages, "בהריון".
const open: ProfileView = {
  fullName: 'נועה רז',
  gender: 'woman',
  childrenCount: 2,
  childAges: [
    { years: 3, months: 4 },
    { years: 0, months: 7 },
  ],
  isPregnant: true,
  showsEmptyJourneySentence: false,
  relationship: 'none',
  friends: people,
  mutualFriends: people.slice(0, 1),
};
// A Restricted profile to a non-Friend: no gender, no ages.
const restricted: ProfileView = { ...open, gender: null, childAges: null, isPregnant: false, childrenCount: 1, friends: [], mutualFriends: [] };
const loaded = { kind: 'loaded', busy: null, failure: null, status: '', confirm: null } as const;
const REMOVE = { saving: false, failure: null } as const;

/** c25: an Open profile, a non-Friend: the summary as returned, the person's Friends and the Friends in common. */
export const UserProfile: Story = { args: { view: { ...loaded, profile: open } } };

/** c25 (Q1): a Restricted profile: the name, the count; both lists with their empty texts. */
export const UserProfileRestricted: Story = { args: { view: { ...loaded, profile: restricted } } };

/** c25: a Friend's view: the Open view, and "הסרה מהחברים". */
export const UserProfileFriend: Story = { args: { view: { ...loaded, profile: { ...open, relationship: 'friends' } } } };

/** c25: no children and no pregnancy: the sentence of §1.4. */
export const EmptyJourneySentence: Story = {
  args: { view: { ...loaded, profile: { ...restricted, childrenCount: 0, showsEmptyJourneySentence: true } } },
};

/** c28: a request was received: "אישור" / "דחייה". */
export const RequestReceived: Story = { args: { view: { ...loaded, profile: { ...open, relationship: 'received' } } } };

/** c28: a request was sent: "ביטול הבקשה". */
export const RequestSent: Story = { args: { view: { ...loaded, profile: { ...open, relationship: 'sent' }, status: 'הבקשה נשלחה' } } };

/** c28: a Professional viewer has no relationship and no action. */
export const ProfessionalViewer: Story = { args: { view: { ...loaded, profile: { ...restricted, relationship: null } } } };

/** c28: a send is in flight; the other actions wait. */
export const SendInFlight: Story = { args: { view: { ...loaded, profile: open, busy: 'send' } } };

/** c28: an action failed; the state stays. */
export const ActionFailed: Story = { args: { view: { ...loaded, profile: open, failure: ACTION_FAILED_TEXT } } };

/** c28: 409; the profile was opened again. */
export const RequestGone: Story = { args: { view: { ...loaded, profile: open, failure: GONE_TEXT } } };

/** c28: a removal found no Friendship; the profile was opened again. */
export const FriendGone: Story = { args: { view: { ...loaded, profile: open, failure: FRIEND_GONE_TEXT } } };

/** c28: "הסרה מהחברים" opened F2.4b's dialog naming the person. */
export const RemoveDialog: Story = { args: { view: { ...loaded, profile: { ...open, relationship: 'friends' }, confirm: REMOVE } } };

export const RemoveDialogFailed: Story = {
  args: { view: { ...loaded, profile: { ...open, relationship: 'friends' }, confirm: { saving: false, failure: ACTION_FAILED_TEXT } } },
};

/** c29: loading shows no profile. */
/** FR-REL-002: the block dialog says what a block does before anything is sent. */
export const BlockDialog: Story = { args: { view: { ...loaded, profile: open, block: { saving: false, failure: null } } } };

export const BlockInFlight: Story = { args: { view: { ...loaded, profile: open, block: { saving: true, failure: null } } } };

export const BlockFailed: Story = { args: { view: { ...loaded, profile: open, block: { saving: false, failure: BLOCK_FAILED_TEXT } } } };

/** FR-REL-002: after the block the profile is no longer shown. */
export const Blocked: Story = { args: { view: { kind: 'blocked' } } };

export const Loading: Story = { args: { view: { kind: 'loading' } } };

/** c29: 404, one text for every reason. */
export const UserProfileUnavailable: Story = { args: { view: { kind: 'unavailable' } } };

/** c29: 429, ERR-032's general message; no profile, no number, no countdown. */
export const UserProfileRateLimited: Story = { args: { view: { kind: 'rate-limited' } } };

/** c29: any other failure: the message and "נסו שוב". */
export const UserProfileLoadFailed: Story = { args: { view: { kind: 'load-failed', message: LOAD_FAILED_TEXT } } };

export const AccountStopped: Story = { args: { view: { kind: 'load-failed', message: STOPPED_TEXT } } };

// F3.7 c10: the report window over the profile ("דיווח על הפרופיל" is on every loaded profile, below the actions).
export const ReportOpen: Story = {
  args: {
    view: { ...loaded, profile: open },
    report: {
      targetKind: 'user',
      reason: null,
      details: '',
      errors: {},
      sending: false,
      failure: null,
      focus: { field: 'reason', tick: 0 },
      rulesHref: '/community-rules',
      onReasonChange: () => undefined,
      onDetailsChange: () => undefined,
      onSend: () => undefined,
      onCancel: () => undefined,
    },
  },
};

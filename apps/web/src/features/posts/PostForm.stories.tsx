import type { Meta, StoryObj } from '@storybook/react-vite';
import { PostForm } from './PostForm';
import { BODY_REQUIRED_TEXT, PUBLISH_FAILED_TEXT } from './posts-texts';

// The composer (F3.1b) in each of its states, drawn from props alone.
function Screen(props: Parameters<typeof PostForm>[0]) {
  return (
    <main className="max-w-md px-4 py-5">
      <PostForm {...props} />
    </main>
  );
}

const meta = {
  title: 'features/posts/PostForm',
  component: Screen,
  parameters: { layout: 'fullscreen' },
  args: { mode: 'create', errors: {}, saving: false, failure: null, onChange: () => undefined, onSubmit: () => undefined },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

const empty = { body: '', audience: 'everyone', stageTag: '' } as const;

export const Empty: Story = { args: { values: empty } };
export const FriendsWithTag: Story = { args: { values: { body: 'שאלה לקבוצה', audience: 'friends', stageTag: 'pregnant' } } };
export const NearLimit: Story = { args: { values: { ...empty, body: 'א'.repeat(1950) } } };
export const Invalid: Story = { args: { values: empty, errors: { body: BODY_REQUIRED_TEXT } } };
export const Saving: Story = { args: { values: { ...empty, body: 'שלום' }, saving: true } };
export const Failed: Story = { args: { values: { ...empty, body: 'שלום' }, failure: PUBLISH_FAILED_TEXT } };

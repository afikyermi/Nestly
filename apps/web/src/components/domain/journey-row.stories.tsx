import type { Meta, StoryObj } from '@storybook/react-vite';
import { JourneyRow } from './journey-row';

const meta = {
  title: 'domain/JourneyRow',
  component: JourneyRow,
  parameters: { layout: 'padded' },
  args: { href: '#home', onNavigate: () => undefined },
} satisfies Meta<typeof JourneyRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PregnancyAndChild: Story = {
  args: {
    contexts: [
      { kind: 'pregnancy', dueDate: '2027-02-14', week: 24, trimester: 2 },
      { kind: 'parenting', childId: 'c1', childName: 'תמר', ageMonths: 39 },
    ],
  },
};

export const Planning: Story = { args: { contexts: [{ kind: 'planning' }] } };

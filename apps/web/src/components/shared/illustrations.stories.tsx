import type { Meta, StoryObj } from '@storybook/react-vite';
import { RegistrationIllustration, WelcomeIllustration } from './illustrations';

const meta = {
  title: 'shared/Illustrations',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Welcome: Story = { render: () => <WelcomeIllustration /> };

export const Registration: Story = { render: () => <RegistrationIllustration /> };

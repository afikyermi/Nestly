import type { Meta, StoryObj } from '@storybook/react-vite';
import { Logo } from './logo';

const meta = {
  title: 'shared/Logo',
  component: Logo,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkDefault: Story = { args: { href: '#home' } };

export const LinkBig: Story = { args: { href: '#home', size: 'big' } };

export const StaticDefault: Story = { args: {} };

export const StaticBig: Story = { args: { size: 'big' } };

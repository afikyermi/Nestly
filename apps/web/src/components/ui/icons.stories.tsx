import type { Meta, StoryObj } from '@storybook/react-vite';
import * as icons from './icons';

const meta = {
  title: 'ui/Icons',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// Every icon of the module, drawn at the default size with the shared stroke.
export const All: Story = {
  render: () => (
    <ul className="grid grid-cols-3 gap-4 text-caption text-foreground">
      {Object.entries(icons).map(([name, Icon]) => (
        <li key={name} className="flex flex-col items-center gap-1">
          <Icon />
          <span dir="ltr">{name}</span>
        </li>
      ))}
    </ul>
  ),
};

// Directional icons mirror with the reading direction: back points to the end side.
export const Directional: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-foreground">
      <icons.ArrowBackIcon />
      <icons.ChevronForwardIcon />
    </div>
  ),
};

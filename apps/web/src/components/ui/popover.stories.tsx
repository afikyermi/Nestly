import type { Meta, StoryObj } from "@storybook/react-vite";
import { BellIcon } from "./icons";
import { Popover } from "./popover";

// The panel under a trigger (the notification dropdown, FR-NOTIF-001).
const meta = {
  title: "ui/Popover",
  component: Popover,
  parameters: { layout: "padded" },
  args: {
    label: "התראות",
    className: "w-80",
    trigger: (
      <button
        type="button"
        aria-label="התראות"
        className="inline-flex size-11 items-center justify-center rounded-md hover:bg-muted"
      >
        <BellIcon />
      </button>
    ),
    children: <p className="p-3 text-body">אין התראות חדשות</p>,
  },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

// Closed: only the trigger.
export const Closed: Story = {};

// Open: the panel under the trigger.
export const Open: Story = { args: { defaultOpen: true } };

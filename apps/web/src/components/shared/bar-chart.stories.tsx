import type { Meta, StoryObj } from '@storybook/react-vite';
import { BarChart, type BarChartPoint } from './bar-chart';

const week: BarChartPoint[] = [
  { label: '14.10', value: 420 },
  { label: '15.10', value: 380 },
  { label: '16.10', value: 0 },
  { label: '17.10', value: 510 },
  { label: '18.10', value: 460 },
  { label: '19.10', value: 300 },
  { label: '20.10', value: 480 },
];

const meta = {
  title: 'shared/BarChart',
  component: BarChart,
  args: {
    title: 'בקבוק, מ״ל ליום',
    points: week,
    unit: 'מ״ל',
    emptyText: 'אין נתונים בתקופה שנבחרה.',
    tableLabel: 'הנתונים בטבלה',
    valueHeader: 'ערך',
    dayHeader: 'יום',
  },
} satisfies Meta<typeof BarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Week: Story = {};
export const SinglePoint: Story = { args: { points: [{ label: '20.10', value: 4.2 }], unit: 'ק״ג', title: 'משקל' } };
export const Empty: Story = { args: { points: week.map((p) => ({ ...p, value: 0 })) } };
export const ManyDays: Story = {
  args: { points: Array.from({ length: 60 }, (_, i) => ({ label: `${(i % 28) + 1}.${i < 28 ? 9 : 10}`, value: (i * 37) % 90 })) },
};
// The Admin's data screens (Afik 28.10.2026): a value axis with a faint grid, rounded bar tops, the title left to the card.
export const Dashboard: Story = { args: { variant: 'dashboard', points: Array.from({ length: 30 }, (_, i) => ({ label: `${(i % 28) + 1}.10`, value: (i * 37) % 90 })) } };
export const DashboardEmpty: Story = { args: { variant: 'dashboard', points: week.map((p) => ({ ...p, value: 0 })) } };

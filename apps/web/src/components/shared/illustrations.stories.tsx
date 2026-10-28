import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  EmptyFeedIllustration,
  ErrorIllustration,
  NoChatsIllustration,
  NoResultsIllustration,
  NoReviewsIllustration,
  RegistrationIllustration,
  WelcomeIllustration,
} from './illustrations';

const meta = {
  title: 'shared/Illustrations',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Welcome: Story = { render: () => <WelcomeIllustration /> };

export const Registration: Story = { render: () => <RegistrationIllustration /> };

export const EmptyFeed: Story = { render: () => <EmptyFeedIllustration /> };

export const NoResults: Story = { render: () => <NoResultsIllustration /> };

export const LoadError: Story = { render: () => <ErrorIllustration /> };

export const NoChats: Story = { render: () => <NoChatsIllustration /> };

export const NoReviews: Story = { render: () => <NoReviewsIllustration /> };

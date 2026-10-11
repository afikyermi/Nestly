import type { StorybookConfig } from '@storybook/react-vite';

// The static gallery (R3). No Chromatic, no telemetry: it builds to plain files.
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-a11y'],
  framework: '@storybook/react-vite',
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
};

export default config;

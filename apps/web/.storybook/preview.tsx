import type { Decorator, Preview } from '@storybook/react-vite';
import { DirectionProvider } from '@/components/ui/direction-provider';
import '@/styles/index.css';

// Every story renders as the app does: Hebrew, right to left, in Assistant. The attributes are
// set on the document at load, before the first story, as index.html does for the app.
document.documentElement.lang = 'he';
document.documentElement.dir = 'rtl';

const withHebrewRtl: Decorator = (Story) => (
  <DirectionProvider>
    <Story />
  </DirectionProvider>
);

const preview: Preview = {
  decorators: [withHebrewRtl],
  initialGlobals: { viewport: { value: 'nestly375', isRotated: false } },
  parameters: {
    layout: 'centered',
    viewport: {
      options: {
        nestly375: { name: 'Mobile 375', styles: { width: '375px', height: '812px' }, type: 'mobile' },
        nestly1024: { name: 'Desktop 1024', styles: { width: '1024px', height: '768px' }, type: 'desktop' },
      },
    },
    a11y: {
      test: 'error',
      options: { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] } },
    },
  },
};

export default preview;

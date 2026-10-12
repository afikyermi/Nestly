import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { ArrowBackIcon } from '../ui/icons';
import { Checkbox } from '../ui/checkbox';
import { TextInput } from '../ui/text-input';
import { FormField } from '../shared/form-field';
import { WelcomeIllustration, RegistrationIllustration } from '../shared/illustrations';
import { Logo } from '../shared/logo';
import { PasswordInput } from '../shared/password-input';
import { StepIndicator } from '../shared/step-indicator';
import { AuthLayout } from './auth-layout';

const meta = {
  title: 'layout/AuthLayout',
  component: AuthLayout,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AuthLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

const back = (
  <Button iconOnly label="חזרה" href="#back">
    <ArrowBackIcon />
  </Button>
);

// Welcome (PG-001, FR-AUTH-001): logo, static illustration, two actions, the primary one first.
export const Welcome: Story = {
  args: {
    children: (
      <main className="flex flex-1 flex-col items-center text-center">
        <div className="mt-6">
          <Logo size="big" />
        </div>
        <div className="mt-7">
          <WelcomeIllustration />
        </div>
        <h1 className="mt-3 text-h1">הצטרפות ל-Nestly</h1>
      </main>
    ),
    actions: (
      <>
        <Button size="lg" block href="#account-type">
          יצירת חשבון חדש
        </Button>
        <Button variant="soft" size="lg" block href="#login">
          כבר יש לי חשבון
        </Button>
      </>
    ),
  },
};

// Login (PG-002, FR-AUTH-002): email and password; the forgot-password link is left out while its channel is TBD.
export const Login: Story = {
  args: {
    children: (
      <main className="flex flex-1 flex-col">
        <div className="mt-6 mb-2 flex justify-center">
          <Logo size="big" />
        </div>
        <h1 className="mb-5 text-center text-h1">כניסה</h1>
        <div className="flex flex-col gap-4">
          <FormField label="אימייל">
            {(control) => <TextInput {...control} type="email" dir="ltr" autoComplete="email" />}
          </FormField>
          <FormField label="סיסמה">
            {(control) => <PasswordInput {...control} autoComplete="current-password" toggleLabel="הצגת הסיסמה" />}
          </FormField>
        </div>
      </main>
    ),
    actions: (
      <>
        <Button size="lg" block>
          התחברות
        </Button>
        <Button variant="soft" size="lg" block href="#account-type">
          יצירת חשבון חדש
        </Button>
      </>
    ),
  },
};

// Registration step 2 (PG-005): back, step indicator, email, password with the VAL-003 rule, terms (FR-REG-004).
export const RegistrationStep: Story = {
  args: {
    back,
    children: (
      <main className="flex flex-1 flex-col">
        <StepIndicator current={2} total={2} />
        <div className="my-2 flex justify-center">
          <RegistrationIllustration />
        </div>
        <h1 className="mb-5 text-h1">פרטי התחברות</h1>
        <div className="flex flex-col gap-4">
          <FormField label="אימייל">
            {(control) => <TextInput {...control} type="email" dir="ltr" autoComplete="email" />}
          </FormField>
          <FormField label="סיסמה">
            {(control) => (
              <PasswordInput
                {...control}
                autoComplete="new-password"
                toggleLabel="הצגת הסיסמה"
                rules={[{ id: 'length', text: 'לפחות 10 תווים', met: false }]}
              />
            )}
          </FormField>
          <Checkbox required>
            אישור <a href="#terms">תנאי השימוש</a> ו<a href="#privacy">מדיניות הפרטיות</a>
          </Checkbox>
        </div>
      </main>
    ),
    actions: (
      <>
        <Button size="lg" block>
          יצירת חשבון
        </Button>
        <Button variant="soft" size="lg" block>
          חזרה
        </Button>
      </>
    ),
  },
};

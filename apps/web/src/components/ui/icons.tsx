import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleMinus,
  createLucideIcon,
  Eye,
  EyeOff,
  House,
  LoaderCircle,
  Menu,
  Plus,
  ShoppingBag,
  Sparkles,
  User,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import { cn } from '@/lib/cn';

// The icon module (design-system skill: Lucide, stroke 1.75, sized by the spacing scale).
// Screens import an icon from here and never from lucide-react, so the stroke and the
// aria-hidden rule are fixed in one place. An icon is decorative: the control or the text
// next to it carries the name.
type IconProps = Omit<LucideProps, 'strokeWidth' | 'absoluteStrokeWidth' | 'size' | 'aria-hidden'>;

function icon(Source: LucideIcon, directional = false) {
  return function Icon({ className, ...props }: IconProps) {
    return (
      <Source
        {...props}
        strokeWidth={1.75}
        aria-hidden="true"
        className={cn('size-6 shrink-0', directional && 'rtl:-scale-x-100', className)}
      />
    );
  };
}

// The nest mark, from the R2 mockup (i-nest). The final logo is OP-022.
const Nest = createLucideIcon('nest', [
  ['path', { d: 'M3 12.5c0 4.4 4 7.5 9 7.5s9-3.1 9-7.5' }],
  ['path', { d: 'M2.5 12.5h19' }],
  ['ellipse', { cx: '9.5', cy: '8.6', rx: '2.3', ry: '3' }],
  ['ellipse', { cx: '14.6', cy: '9.2', rx: '2.1', ry: '2.6' }],
]);

export const MenuIcon = icon(Menu);
export const HomeIcon = icon(House);
export const EyeIcon = icon(Eye);
export const EyeOffIcon = icon(EyeOff);
export const AlertIcon = icon(CircleAlert);
export const CheckIcon = icon(Check);
export const ChevronDownIcon = icon(ChevronDown);
export const PlusIcon = icon(Plus);
export const MinusIcon = icon(CircleMinus);
export const UserIcon = icon(User);
export const CloseIcon = icon(X);
export const LoaderIcon = icon(LoaderCircle);
export const NestIcon = icon(Nest);
export const BagIcon = icon(ShoppingBag);
export const SparkIcon = icon(Sparkles);
// Directional icons point the reading direction's way: mirrored under rtl.
// Back points to the end side (right in Hebrew), forward to the start side (left).
export const ArrowBackIcon = icon(ArrowLeft, true);
export const ChevronForwardIcon = icon(ChevronRight, true);

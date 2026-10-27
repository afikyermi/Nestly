import {
  ArrowLeft,
  Bell,
  Search,
  Settings,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleMinus,
  createLucideIcon,
  Ellipsis,
  Eye,
  EyeOff,
  HandHeart,
  Heart,
  House,
  LoaderCircle,
  Menu,
  MessageCircle,
  Phone,
  Plus,
  Repeat2,
  Share2,
  ShoppingBag,
  Sparkles,
  User,
  UserCheck,
  Users,
  Lock,
  Image as ImageLucide,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import { useId } from 'react';
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

// The nest mark (OP-022, closed 27.10.2026): a bowl of waves holding an egg. It is the feed tab and the like.
const Nest = createLucideIcon('nest', [
  ['ellipse', { cx: '12', cy: '7.6', rx: '3.4', ry: '4.3', transform: 'rotate(-12 12 7.6)' }],
  ['path', { d: 'M2.8 12.2c0 5.2 4.1 9.2 9.2 9.2s9.2-4 9.2-9.2z' }],
  ['path', { d: 'M6.2 15.6c1.9-1.1 3.9-1.1 5.8 0s3.9 1.1 5.8 0' }],
]);

// An anonymous writer: a dashed person (no Lucide equivalent).
const Anon = createLucideIcon('anon', [
  ['circle', { cx: '12', cy: '8.5', r: '3.8', strokeDasharray: '2.6 2.4' }],
  ['path', { d: 'M4.5 20a7.5 7.5 0 0 1 15 0', strokeDasharray: '2.6 2.4' }],
]);

export const MenuIcon = icon(Menu);
export const BellIcon = icon(Bell);
export const SearchIcon = icon(Search);
export const SettingsIcon = icon(Settings);
export const HomeIcon = icon(House);
export const EyeIcon = icon(Eye);
export const EyeOffIcon = icon(EyeOff);
export const AlertIcon = icon(CircleAlert);
export const CheckIcon = icon(Check);
export const ChevronDownIcon = icon(ChevronDown);
export const PlusIcon = icon(Plus);
export const MinusIcon = icon(CircleMinus);
export const UserIcon = icon(User);
// The desktop shortcuts column (redesign 27.10.2026): groups, the Professionals followed.
export const UsersIcon = icon(Users);
export const UserCheckIcon = icon(UserCheck);
// "רק אתם רואים" (the journey row) and the composer's photo hint.
export const LockIcon = icon(Lock);
export const ImageIcon = icon(ImageLucide);
export const CloseIcon = icon(X);
export const LoaderIcon = icon(LoaderCircle);
export const NestIcon = icon(Nest);
export const AnonIcon = icon(Anon);
// Offer Help (FR-SERV-005): a hand holding a heart, distinct from the like on purpose.
export const HelpIcon = icon(HandHeart);
export const BagIcon = icon(ShoppingBag);
export const SparkIcon = icon(Sparkles);
export const HeartIcon = icon(Heart);
export const MoreIcon = icon(Ellipsis);
export const PhoneIcon = icon(Phone);
// I8: the Chat Center in the Top Bar (FR-CHAT-001).
export const MessageIcon = icon(MessageCircle);
// A post's "תגובות" action (the same speech bubble as the Chat Center).
export const CommentIcon = icon(MessageCircle);
// F3.5, F3.6: share into one's feed (a repost), and send a link out of the app.
export const ShareInFeedIcon = icon(Repeat2);
export const ShareLinkIcon = icon(Share2);
// F3.2b c20: "חזרה למעלה" where only its icon fits (1024-1279 px, beside the column).
export const ArrowUpIcon = icon(ArrowUp);
// Directional icons point the reading direction's way: mirrored under rtl.
// Back points to the end side (right in Hebrew), forward to the start side (left).
export const ArrowBackIcon = icon(ArrowLeft, true);
export const ChevronForwardIcon = icon(ChevronRight, true);

// The filled nest: "selected" in the bottom navigation and "liked" on the like. The waves are cut out of the bowl, so they show
// whatever surface is behind it. The mask id is per instance.
export function NestFilledIcon({ className }: { className?: string }) {
  const mask = useId();
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={cn('size-6 shrink-0', className)}>
      <defs>
        <mask id={mask}>
          <rect width="24" height="24" fill="white" />
          <path d="M5.6 15.7c2.1-1.2 4.3-1.2 6.4 0s4.3 1.2 6.4 0" fill="none" stroke="black" strokeWidth={1.7} strokeLinecap="round" />
        </mask>
      </defs>
      <ellipse cx="12" cy="7.2" rx="3.5" ry="4.4" transform="rotate(-12 12 7.2)" />
      <path mask={`url(#${mask})`} d="M2 11.8h20c0 5.7-4.5 10-10 10S2 17.5 2 11.8z" />
    </svg>
  );
}

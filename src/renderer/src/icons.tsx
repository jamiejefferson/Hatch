// Every icon draws on a 16 px grid with a 1.5 px stroke in the current colour, with round caps and joins.
interface IconProps {
  size?: number;
}

const make = (d: string, extra?: React.ReactNode) =>
  function Icon({ size = 16 }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
        {extra}
      </svg>
    );
  };

export const CloseIcon = make('M4 4l8 8M12 4l-8 8');
export const PlusIcon = make('M8 3v10M3 8h10');
export const MinusIcon = make('M3 8h10');
export const LeftColumnIcon = make('M2.5 3.5h11v9h-11zM6 3.5v9');
export const JumpBackIcon = make('M8 3.5L3.5 8 8 12.5M12.5 3.5L8 8l4.5 4.5');
export const JumpForwardIcon = make('M3.5 3.5L8 8l-4.5 4.5M8 3.5L12.5 8 8 12.5');
export const SearchIcon = make('M10.5 10.5l3 3', <circle cx="7" cy="7" r="4.5" />);
export const ArrowRightIcon = make('M3 8h10M9 4l4 4-4 4');
export const BackIcon = make('M10 3L5 8l5 5');
export const ForwardIcon = make('M6 3l5 5-5 5');
export const ReloadIcon = make('M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3');
export const StopIcon = make('M4.5 4.5h7v7h-7z');
export const PlayIcon = make('M5.5 3.5l7 4.5-7 4.5z');
export const OpenIcon = make('M6 3.5H3.5v9h9V10M9 3.5h3.5V7M12.5 3.5L7.5 8.5');
export const CopyIcon = make('M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3');
export const DuplicateIcon = make('M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3M9.5 7.5v4M7.5 9.5h4');
export const BinIcon = make('M3 4.5h10M6 4.5V3h4v1.5M4.2 4.5l.6 8.5h6.4l.6-8.5M6.7 7v3.5M9.3 7v3.5');
export const EditIcon = make('M3 13l.6-2.8L10.8 3l2.2 2.2-7.2 7.2z');
export const CommentIcon = make('M2.5 3.5h11v7.5h-6l-3 2.5v-2.5h-2z');
export const GrabIcon = make('M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3M6 6h4v4H6z');
export const CheckIcon = make('M3 8.5l3.2 3.2L13 4.5');
export const OutlineIcon = make('M2.5 3.5h5M6 8h7.5M6 12.5h7.5M3.5 3.5v9H6M3.5 8H6');
export const FitIcon = make('M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9');
export const ReleaseIcon = make('M13 7H9V3M9 7l4.5-4.5M3 9h4v4M7 9l-4.5 4.5');
export const ShowAllIcon = make('M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z');
export const SaveLinkIcon = make('M4 2.5h8v11l-4-3-4 3z');
export const MoreIcon = make('', <><circle cx="3.5" cy="8" r="0.6" /><circle cx="8" cy="8" r="0.6" /><circle cx="12.5" cy="8" r="0.6" /></>);
export const FolderIcon = make('M2 4.5V12.5h12V5.5H8L6.5 3.5H2z');
export const ChevronIcon = make('M6 3l5 5-5 5');
export const SoundIcon = make('M2.5 6h2.5l3.5-3v10L5 10H2.5zM11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9');
export const MutedIcon = make('M2.5 6h2.5l3.5-3v10L5 10H2.5zM11 6l3.5 4M14.5 6L11 10');
export const PinIcon = make('M5.5 2.5h5l-1 1.5v2.5l2 2.5h-7l2-2.5V4zM8 9v4.5');
export const NoteIcon = make('M2.5 2.5h11v7l-4 4h-7zM13.5 9.5h-4v4');
export const SaveIcon = make('M2.5 2.5h9l2 2v9h-11zM5 2.5v3.5h5V2.5M4.5 13.5V9h7v4.5');

// Device templates.
export const DesktopIcon = make('M2 3h12v8H2zM6 14h4M8 11v3');
export const LaptopIcon = make('M3.5 4h9v6.5h-9zM1.5 12.5h13');
export const TabletPortraitIcon = make('M4 2h8v12H4zM7.2 12h1.6');
export const TabletLandscapeIcon = make('M2 4h12v8H2zM12 7.2v1.6');
export const MobileIcon = make('M5 2h6v12H5zM7.2 12h1.6');

// Panels and the top strip.
export const HatchIcon = make('M2.5 3.5h11v9h-11zM2.5 6h11');
export const ProjectsIcon = make('M2 4.5V12.5h12V5.5H8L6.5 3.5H2z');
export const LinksIcon = SaveLinkIcon;
export const ActivityIcon = make('M1.5 8.5h3l2-5 3 9 2-4h3');
export const SignInsIcon = make('M9.2 6.8L14 2M11.5 4.5l1.5 1.5M12.8 3.2l1.5 1.5', <circle cx="6" cy="10" r="3.2" />);
export const SettingsIcon = make('M2 4.5h6M11.5 4.5H14M2 11.5h2.5M8 11.5h6', <><circle cx="9.75" cy="4.5" r="1.75" /><circle cx="6.25" cy="11.5" r="1.75" /></>);

export const FeedbackIcon = make('M2.5 3h11v8h-5.5l-3 2.5V11h-2.5zM5.5 6h5M5.5 8.5h3');

export function EyeIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Action buttons. Each key is an ActionIcon from @shared/types.
const dot = (cx: number, cy: number, r: number) => <circle cx={cx} cy={cy} r={r} />;
export const ACTION_ICON_ART: Record<import('@shared/types').ActionIcon, { label: string; Icon: (props: IconProps) => React.JSX.Element }> = {
  web: { label: 'Web', Icon: make('M1.5 8h13M8 1.5c-2 2-2.8 4.2-2.8 6.5s.8 4.5 2.8 6.5M8 1.5c2 2 2.8 4.2 2.8 6.5s-.8 4.5-2.8 6.5', dot(8, 8, 6.5)) },
  spreadsheet: { label: 'Spreadsheet', Icon: make('M2.5 2.5h11v11h-11zM2.5 6h11M2.5 9.75h11M6.5 2.5v11') },
  document: { label: 'Document', Icon: make('M3.5 1.5h6l3 3v10h-9zM9.5 1.5v3h3M5.5 8h5M5.5 10.5h5M5.5 5.5h2') },
  slides: { label: 'Slides', Icon: make('M1.5 2.5h13v8.5h-13zM8 11v3M5.5 14h5M4.5 5.5h7M4.5 8h4.5') },
  mail: { label: 'Mail', Icon: make('M1.5 3.5h13v9h-13zM1.5 4l6.5 5 6.5-5') },
  calendar: { label: 'Calendar', Icon: make('M2 3.5h12v10H2zM2 6.5h12M5 2v3M11 2v3') },
  chat: { label: 'Chat', Icon: make('M8 2.5c3.3 0 5.5 2 5.5 4.5S11.3 11.5 8 11.5c-.8 0-1.5-.1-2.2-.3L3 13l.7-2.6C2.9 9.5 2.5 8.3 2.5 7c0-2.5 2.2-4.5 5.5-4.5z') },
  video: { label: 'Video', Icon: make('M1.5 4h9v8h-9zM10.5 7l4-2.5v7l-4-2.5') },
  folder: { label: 'Folder', Icon: make('M2 4.5V12.5h12V5.5H8L6.5 3.5H2z') },
  design: { label: 'Design', Icon: make('M2.5 13.5l1.5-5 6.5-6.5 3.5 3.5-6.5 6.5zM4 8.5l3.5 3.5M9 3.5l3.5 3.5') },
  code: { label: 'Code', Icon: make('M5.5 4L1.5 8l4 4M10.5 4l4 4-4 4M9 2.5l-2 11') },
  chart: { label: 'Chart', Icon: make('M2 2v12h12M5 11V8M8 11V5M11 11V7') },
  tasks: { label: 'Tasks', Icon: make('M2.5 4l1.5 1.5L6.5 3M2.5 10l1.5 1.5L6.5 9M8.5 4.5h5M8.5 10.5h5') },
  ai: { label: 'AI', Icon: make('M8 1.5l1.5 4.5 4.5 1.5-4.5 1.5L8 13.5 6.5 9 2 7.5 6.5 6z') },
  music: { label: 'Music', Icon: make('M6 12V3.5l7-1.5v8.5', <>{dot(4.5, 12, 1.5)}{dot(11.5, 10.5, 1.5)}</>) },
  photos: { label: 'Photos', Icon: make('M2 3h12v10H2zM2 11l3.5-3.5 3 3 2-2L14 12', dot(10.5, 6, 1)) },
  shop: { label: 'Shop', Icon: make('M1.5 2.5h2l1.5 8h8l1.5-6H4.2', <>{dot(6, 13.2, 0.8)}{dot(12, 13.2, 0.8)}</>) },
  map: { label: 'Map', Icon: make('M8 14.5s-4.5-4.2-4.5-7.5a4.5 4.5 0 0 1 9 0c0 3.3-4.5 7.5-4.5 7.5z', dot(8, 7, 1.5)) },
  cloud: { label: 'Cloud', Icon: make('M4.5 12.5a3 3 0 0 1-.4-6 4 4 0 0 1 7.7-1 3.5 3.5 0 0 1 .2 7z') },
  book: { label: 'Book', Icon: make('M2 3c2 0 4.5.3 6 1.5 1.5-1.2 4-1.5 6-1.5v9.5c-2 0-4.5.3-6 1.5-1.5-1.2-4-1.5-6-1.5zM8 4.5V14') },
  star: { label: 'Star', Icon: make('M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z') },
  bolt: { label: 'Bolt', Icon: make('M9 1.5L3.5 9h4L7 14.5 12.5 7h-4z') },
  home: { label: 'Home', Icon: make('M2 7.5L8 2.5l6 5M3.5 6.3v7.2h9V6.3M6.5 13.5V10h3v3.5') },
  people: { label: 'People', Icon: make('M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 9.6c2 0 3.5 1.3 3.5 3.4', <>{dot(6, 5.5, 2.2)}{dot(11.5, 6, 1.7)}</>) },
  bell: { label: 'Bell', Icon: make('M4 11V7a4 4 0 0 1 8 0v4l1.2 1.5H2.8zM6.5 14h3') },
  search: { label: 'Search', Icon: make('M10.3 10.3l4 4', dot(7, 7, 4.5)) },
  link: { label: 'Link', Icon: make('M6.5 9.5l3-3M7 4.5l1.2-1.2a2.8 2.8 0 0 1 4 4L11 8.5M9 11.5l-1.2 1.2a2.8 2.8 0 0 1-4-4L5 7.5') },
  bookmark: { label: 'Bookmark', Icon: make('M4 1.5h8v13l-4-3-4 3z') },
  lock: { label: 'Lock', Icon: make('M3.5 7h9v7h-9zM5.5 7V5a2.5 2.5 0 0 1 5 0v2') },
  terminal: { label: 'Terminal', Icon: make('M1.5 2.5h13v11h-13zM4 6l2.5 2L4 10M8 10.5h4') },
  database: { label: 'Database', Icon: make('M2.5 4c0-1.1 2.5-2 5.5-2s5.5.9 5.5 2-2.5 2-5.5 2-5.5-.9-5.5-2zM2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2') },
  server: { label: 'Server', Icon: make('M2 2.5h12v4.5H2zM2 9h12v4.5H2z', <>{dot(4.5, 4.75, 0.6)}{dot(4.5, 11.25, 0.6)}</>) },
  bug: { label: 'Bug', Icon: make('M5 6.5h6v4a3 3 0 0 1-6 0zM6 6.5a2 2 0 0 1 4 0M8 7v6.5M1.5 9H5M11 9h3.5M2.5 5l2.5 1.5M13.5 5L11 6.5M2.5 13l2.7-1.7M13.5 13l-2.7-1.7') },
  branch: { label: 'Branch', Icon: make('M4.5 4.5v7M4.5 10c0-2.5 7-2 7-4', <>{dot(4.5, 3, 1.5)}{dot(4.5, 13, 1.5)}{dot(11.5, 4.5, 1.5)}</>) },
  news: { label: 'News', Icon: make('M2 2.5h10v11H3.5A1.5 1.5 0 0 1 2 12zM12 5.5h2V12a1.5 1.5 0 0 1-3 0M4.5 5.5h5M4.5 8h5M4.5 10.5h3') },
  mic: { label: 'Microphone', Icon: make('M6 3.5a2 2 0 0 1 4 0v4a2 2 0 0 1-4 0zM3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5') },
  camera: { label: 'Camera', Icon: make('M1.5 4.5h3l1.5-2h4l1.5 2h3v9h-13z', dot(8, 8.5, 2.5)) },
  phone: { label: 'Phone', Icon: make('M4.5 1.5h7v13h-7zM7 12.5h2') },
  heart: { label: 'Heart', Icon: make('M8 13.5S2 10 2 5.8A3 3 0 0 1 8 4.5a3 3 0 0 1 6 1.3C14 10 8 13.5 8 13.5z') },
  flag: { label: 'Flag', Icon: make('M3.5 14.5V2M3.5 2.5h9l-2 3 2 3h-9') },
  clock: { label: 'Clock', Icon: make('M8 4.5V8l2.5 1.5', dot(8, 8, 6.5)) },
  wallet: { label: 'Wallet', Icon: make('M2 4.5h11.5v9H2zM2 4.5l9-2.5v2.5M10.5 7.75h3v2.5h-3z') },
  card: { label: 'Card', Icon: make('M1.5 3.5h13v9h-13zM1.5 6.5h13M4 10h3') },
  briefcase: { label: 'Briefcase', Icon: make('M1.5 5h13v8.5h-13zM5.5 5V2.5h5V5M1.5 8.5h13') },
  send: { label: 'Send', Icon: make('M14.5 1.5L1.5 7l5 2.5 2.5 5zM6.5 9.5l8-8') },
  coffee: { label: 'Coffee', Icon: make('M2.5 6h9v4a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4zM11.5 7.5h1a2 2 0 0 1 0 4h-1.3M5 1.5V4M8 1.5V4') },
  game: { label: 'Game', Icon: make('M5 4.5h6a3.5 3.5 0 0 1 3.4 4.3l-.6 3a1.8 1.8 0 0 1-3.1.8L9 11H7l-1.7 1.6a1.8 1.8 0 0 1-3.1-.8l-.6-3A3.5 3.5 0 0 1 5 4.5zM5 6.8v2.4M3.8 8h2.4', <>{dot(10.5, 7.2, 0.5)}{dot(11.8, 8.8, 0.5)}</>) },
  gift: { label: 'Gift', Icon: make('M2 6h12v3H2zM3 9h10v5H3zM8 6v8M8 6L6 3.5a1.4 1.4 0 0 0-2 2C4.6 6 8 6 8 6zM8 6l2-2.5a1.4 1.4 0 0 1 2 2C11.4 6 8 6 8 6z') },
  inbox: { label: 'Inbox', Icon: make('M1.5 9l2-6h9l2 6v4.5h-13zM1.5 9h4l1 2h3l1-2h4') },
  board: { label: 'Board', Icon: make('M2 2.5h12v11H2zM6 2.5v11M10 2.5v11M3.5 5h1M7.5 5h1M11.5 5h1M3.5 7.5h1M11.5 7.5h1') },
  pencil: { label: 'Pencil', Icon: make('M10.5 2.5l3 3L5 14H2v-3zM9 4l3 3') },
  tv: { label: 'TV', Icon: make('M1.5 4h13v8.5h-13zM5.5 14.5h5M5.5 1.5L8 4l2.5-2.5') },
  health: { label: 'Health', Icon: make('M6 2h4v4h4v4h-4v4H6v-4H2V6h4z') },
  school: { label: 'School', Icon: make('M8 2.5L1 6l7 3.5L15 6zM4 7.5V11c0 1 1.8 2.2 4 2.2s4-1.2 4-2.2V7.5M15 6v4') },
};

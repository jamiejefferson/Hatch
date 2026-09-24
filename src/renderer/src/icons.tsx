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
export const SidebarIcon = make('M2.5 3.5h11v9h-11zM10 3.5v9');
export const BackIcon = make('M10 3L5 8l5 5');
export const ForwardIcon = make('M6 3l5 5-5 5');
export const ReloadIcon = make('M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3');
export const StopIcon = make('M4.5 4.5h7v7h-7z');
export const PlayIcon = make('M5.5 3.5l7 4.5-7 4.5z');
export const OpenIcon = make('M6 3.5H3.5v9h9V10M9 3.5h3.5V7M12.5 3.5L7.5 8.5');
export const CopyIcon = make('M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3');
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
export const FolderIcon = make('M2 4.5V12.5h12V5.5H8L6.5 3.5H2z');
export const ChevronIcon = make('M6 3l5 5-5 5');
export const SaveIcon = make('M2.5 2.5h9l2 2v9h-11zM5 2.5v3.5h5V2.5M4.5 13.5V9h7v4.5');

// Device templates.
export const DesktopIcon = make('M2 3h12v8H2zM6 14h4M8 11v3');
export const LaptopIcon = make('M3.5 4h9v6.5h-9zM1.5 12.5h13');
export const TabletPortraitIcon = make('M4 2h8v12H4zM7.2 12h1.6');
export const TabletLandscapeIcon = make('M2 4h12v8H2zM12 7.2v1.6');
export const MobileIcon = make('M5 2h6v12H5zM7.2 12h1.6');

// The six panels of the top strip.
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

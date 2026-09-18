import { useEffect, useState } from 'react';
import ident from '../assets/hatch-ident.svg';
import wordmark from '../assets/hatch-wordmark.svg';
import { useStore } from '../state/store';

const SHOWN_MS = 1900;
const LEAVING_MS = 400;

/** The start-up sequence: the logo, the strapline and the version, for about two seconds. A click or a key ends it early. */
export function Intro() {
  const version = useStore((s) => s.connection?.version ?? '');
  const [phase, setPhase] = useState<'shown' | 'leaving' | 'gone'>('shown');

  useEffect(() => {
    const leave = setTimeout(() => setPhase('leaving'), SHOWN_MS);
    const go = setTimeout(() => setPhase('gone'), SHOWN_MS + LEAVING_MS);
    const skip = (): void => setPhase('gone');
    window.addEventListener('keydown', skip);
    return () => {
      clearTimeout(leave);
      clearTimeout(go);
      window.removeEventListener('keydown', skip);
    };
  }, []);

  if (phase === 'gone') return null;
  return (
    <div className={`intro${phase === 'leaving' ? ' leaving' : ''}`} role="img" aria-label={`Hatch ${version}. Open the Web.`} onPointerDown={() => setPhase('gone')} data-testid="intro">
      {/* The lockup from the wordmark file, with the colour ident in place of the black one. The letters start 101 units into its 294-unit width. */}
      <div className="intro-lockup">
        <img className="intro-ident" src={ident} alt="" width="72" height="72" />
        <span className="intro-letters" style={{ backgroundImage: `url("${wordmark}")` }} />
      </div>
      <p className="intro-line">Open the Web</p>
      <p className="intro-version mono">{version && `Version ${version}`}</p>
    </div>
  );
}

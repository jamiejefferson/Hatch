import { useEffect } from 'react';
import type { MenuCommand } from '../../preload/api';
import type { Tab } from '@shared/types';
import { Canvas } from './canvas/Canvas';
import { NewHatchModal } from './canvas/NewHatchModal';
import { pages } from './canvas/webviews';
import { LeftColumn } from './shell/LeftColumn';
import { Sidebar } from './shell/Sidebar';
import { Toolbar } from './shell/Toolbar';
import { ConnectionBanner } from './shell/Connect';
import { ContextMenu, Toast } from './shell/ContextMenu';
import { Guide } from './shell/Guide';
import { Intro } from './shell/Intro';
import { TopStrip } from './shell/TopStrip';
import { WhatsNew } from './shell/WhatsNew';
import { actions, activeTab, boot, flushSave, getState, listen, useStore } from './state/store';

function run(command: MenuCommand): void {
  const tab = activeTab(getState());
  const selected = tab.selectedHatchId;
  switch (command) {
    case 'new-hatch': return actions.requestNewHatch();
    case 'new-tab': return void actions.newTab();
    case 'close-hatch': return selected ? actions.closeHatch(selected) : actions.closeTab(tab.id);
    case 'duplicate-hatch': return void (selected && actions.duplicateHatch(selected));
    case 'close-tab': return actions.closeTab(tab.id);
    case 'reload-hatch': return void (selected && pages.reload(selected));
    case 'back': return void (selected && pages.back(selected));
    case 'forward': return void (selected && pages.forward(selected));
    case 'zoom-in': return actions.zoomStep(1);
    case 'zoom-out': return actions.zoomStep(-1);
    case 'zoom-actual': return actions.zoomTo(1);
    case 'toggle-sidebar': return actions.toggleSidebar();
    case 'toggle-left': return actions.toggleLeft();
    case 'inspect-hatch': return void (selected && pages.inspect(selected));
    case 'deselect': return actions.escape();
    case 'toggle-view': return void (selected && actions.toggleView(selected));
    case 'show-guide': return actions.startGuide();
    case 'send-feedback': return void actions.openFeedback();
  }
}

export function App() {
  const ready = useStore((s) => s.ready);
  const tabs = useStore((s) => s.workspace.tabs);
  const activeTabId = useStore((s) => s.workspace.activeTabId);
  const sidebarOpen = useStore((s) => s.workspace.sidebarOpen);
  const leftOpen = useStore((s) => s.workspace.leftOpen !== false);

  useEffect(() => {
    void boot();
    const off = window.hatch.on('command', run);
    const unlisten = listen();
    window.addEventListener('beforeunload', flushSave);
    // Keys reach this handler only while the focus sits in Hatch's own interface. A focused page keeps its keys.
    const onKey = (e: KeyboardEvent): void => {
      const s = getState();
      if (e.defaultPrevented || s.newHatchOpen) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'Escape') return actions.escape();
      // Delete closes the selected Hatch, as it removes a frame in a design tool.
      const selected = activeTab(s).selectedHatchId;
      if ((e.key === 'Backspace' || e.key === 'Delete') && selected && !s.guideOpen && !s.contextMenu && !e.metaKey && !e.altKey && !e.ctrlKey) {
        e.preventDefault();
        actions.closeHatch(selected);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      off();
      unlisten();
      window.removeEventListener('beforeunload', flushSave);
      window.removeEventListener('keydown', onKey);
    };
  }, []);


  // The start-up sequence mounts once, above everything. Mounting it again when the workspace arrives would restart its animation.
  return (
    <>
      {window.hatch.intro && <Intro />}
      {ready && <Shell tabs={tabs} activeTabId={activeTabId} sidebarOpen={sidebarOpen} leftOpen={leftOpen} />}
    </>
  );
}

function Shell({ tabs, activeTabId, sidebarOpen, leftOpen }: { tabs: Tab[]; activeTabId: string; sidebarOpen: boolean; leftOpen: boolean }) {
  return (
    <div className="app">
      <TopStrip />
      <ConnectionBanner />
      <div className="main">
        {leftOpen && <LeftColumn />}
        <Toolbar />
        {/* Every tab's canvas stays mounted, because removing a webview reloads its page. */}
        <div className="canvases">
          {tabs.map((tab) => (
            <Canvas key={tab.id} tab={tab} active={tab.id === activeTabId} />
          ))}
        </div>
        {sidebarOpen && <Sidebar />}
      </div>
      <NewHatchModal />
      <ContextMenu />
      <Toast />
      <Guide />
      <WhatsNew />
    </div>
  );
}

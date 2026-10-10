// View → Navigation (panes or tabs) and Dock window (this page in a narrow
// window along the right edge of the screen, for notes beside other work).
import React, { useState } from 'react';
import { notebookPageLink } from '../pageLinks';
import { useNotebookWorkspace } from '../workspaceContext';
import { RibbonButton, RibbonGroup } from './RibbonParts';

export const DOCK_WIDTH = 440;

export function dockFeatures(screenInfo: { availWidth: number; availHeight: number; availLeft?: number; availTop?: number }) {
  const left = (screenInfo.availLeft ?? 0) + Math.max(0, screenInfo.availWidth - DOCK_WIDTH);
  return `popup,width=${DOCK_WIDTH},height=${screenInfo.availHeight},left=${left},top=${screenInfo.availTop ?? 0}`;
}

export function ViewControls({ pageId }: { pageId?: number }) {
  const workspace = useNotebookWorkspace();
  const [notice, notify] = useState('');
  const layout = workspace?.navigationLayout ?? 'panes';
  const dock = () => {
    const s = window.screen as Screen & { availLeft?: number; availTop?: number };
    if (pageId === undefined) return;
    const opened = window.open(notebookPageLink(pageId), 'cp-notebook-docked', dockFeatures(s));
    if (!opened) notify('Your browser blocked the docked window. Allow pop-ups for this site and try again.');
    else { opened.focus(); notify('Opened this page in a docked window on the right of your screen.'); }
  };
  return <>
    {workspace?.setNavigationLayout && <RibbonGroup label="Navigation">
      <RibbonButton label="Navigation panes" icon="Panes" showLabel active={layout === 'panes'} onClick={() => workspace.setNavigationLayout?.('panes')} />
      <RibbonButton label="Tabs layout" icon="Tabs" showLabel active={layout === 'tabs'} onClick={() => workspace.setNavigationLayout?.('tabs')} />
    </RibbonGroup>}
    {pageId !== undefined && <RibbonGroup label="Window"><RibbonButton label="Dock window" icon="Dock" showLabel onClick={dock} />{notice && <span role="status" className="nb-small">{notice}</span>}</RibbonGroup>}
  </>;
}

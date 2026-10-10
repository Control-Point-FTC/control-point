import React from 'react';
import {Editor} from '@tiptap/core';
import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {NotebookToolbar} from '../NotebookToolbar';
import {notebookExtensions} from '../editorSchema';
let editor:Editor;
afterEach(()=>{cleanup();editor?.destroy();});
describe('notebook contextual ribbon',()=>{
  it('opens drawing commands on annotation requests while preserving manual tab changes between requests',()=>{
    editor=new Editor({extensions:notebookExtensions(false,true),content:'<p>Notebook</p>'});
    const request={group:'draw',key:1},panels={draw:<p>Scoped drawing controls</p>};
    const view=render(<NotebookToolbar editor={editor} disabled={false} pages={[]} pageId={1} panels={panels} requestedGroup={request}/>);
    expect(screen.getByRole('tab',{name:'Draw'})).toHaveAttribute('aria-selected','true');
    fireEvent.click(screen.getByRole('tab',{name:'Home'}));expect(screen.getByRole('tab',{name:'Home'})).toHaveAttribute('aria-selected','true');
    view.rerender(<NotebookToolbar editor={editor} disabled={false} pages={[]} pageId={1} panels={panels} requestedGroup={request}/>);
    expect(screen.getByRole('tab',{name:'Home'})).toHaveAttribute('aria-selected','true');
    view.rerender(<NotebookToolbar editor={editor} disabled={false} pages={[]} pageId={1} panels={panels} requestedGroup={{group:'draw',key:2}}/>);
    expect(screen.getByRole('tab',{name:'Draw'})).toHaveAttribute('aria-selected','true');
  });
});

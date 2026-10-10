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
  it('applies heading levels 4-6 from the paragraph style menu',()=>{
    editor=new Editor({extensions:notebookExtensions(false,true),content:'<p>Deep dive</p>'});
    render(<NotebookToolbar editor={editor} disabled={false} pages={[]} pageId={1}/>);
    editor.commands.focus();editor.commands.selectAll();
    fireEvent.change(screen.getByLabelText('Paragraph style'),{target:{value:'4'}});
    expect(editor.getHTML()).toMatch(/<h4[\s>]/);
    fireEvent.change(screen.getByLabelText('Paragraph style'),{target:{value:'6'}});
    expect(editor.getHTML()).toMatch(/<h6[\s>]/);
    fireEvent.change(screen.getByLabelText('Paragraph style'),{target:{value:'paragraph'}});
    expect(editor.getHTML()).toMatch(/<p[\s>]/);
  });
  it('inserts emoji and symbols from the pickers without losing the selection',()=>{
    editor=new Editor({extensions:notebookExtensions(false,true),content:'<p>Build </p>'});
    render(<NotebookToolbar editor={editor} disabled={false} pages={[]} pageId={1}/>);
    editor.commands.focus();
    fireEvent.click(screen.getByRole('button',{name:'Emoji'}));
    expect(screen.getByRole('dialog',{name:'Emoji picker'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Insert 🚀'}));
    expect(editor.getHTML()).toContain('🚀');
    fireEvent.click(screen.getByRole('button',{name:'Symbols'}));
    expect(screen.getByRole('dialog',{name:'Symbol picker'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Insert →'}));
    const html=editor.getHTML();
    expect(html).toContain('🚀');expect(html).toContain('→');
    fireEvent.click(screen.getByRole('button',{name:'Symbols'}));
    expect(screen.queryByRole('dialog',{name:'Symbol picker'})).toBeNull();
  });
});

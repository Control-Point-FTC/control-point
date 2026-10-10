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
  it('inserts emoji and symbols at the caret without losing the selection',()=>{
    editor=new Editor({extensions:notebookExtensions(false,true),content:'<p>Hello</p>'});
    const view=render(<NotebookToolbar editor={editor} disabled={false} pages={[]} pageId={1}/>);
    editor.commands.focus();editor.commands.setTextSelection(6); // caret after "Hello"
    fireEvent.click(screen.getByRole('tab',{name:'Insert'}));
    const emojiBtn=screen.getByRole('button',{name:'Emoji'});
    fireEvent.mouseDown(emojiBtn);fireEvent.click(emojiBtn);
    expect(screen.getByRole('dialog',{name:'Emoji picker'})).toBeTruthy();
    const rocket=screen.getByRole('button',{name:'Insert 🚀'});
    fireEvent.mouseDown(rocket);fireEvent.click(rocket);
    expect(editor.state.doc.textContent).toBe('Hello🚀');
    // picker stays open for another insert; switching pickers works despite the backdrop
    const symBtn=screen.getByRole('button',{name:'Symbols'});
    fireEvent.mouseDown(symBtn);fireEvent.click(symBtn);
    expect(screen.getByRole('dialog',{name:'Symbol picker'})).toBeTruthy();
    expect(screen.queryByRole('dialog',{name:'Emoji picker'})).toBeNull();
    const arrow=screen.getByRole('button',{name:'Insert →'});
    fireEvent.mouseDown(arrow);fireEvent.click(arrow);
    expect(editor.state.doc.textContent).toBe('Hello🚀→');
    // Escape closes the picker even though focus stayed in the editor
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('dialog',{name:'Symbol picker'})).toBeNull();
    // becoming read-only closes the picker and disables its cells
    fireEvent.mouseDown(emojiBtn);fireEvent.click(emojiBtn);
    expect(screen.getByRole('dialog',{name:'Emoji picker'})).toBeTruthy();
    view.rerender(<NotebookToolbar editor={editor} disabled={true} pages={[]} pageId={1}/>);
    expect(screen.queryByRole('dialog',{name:'Emoji picker'})).toBeNull();
  });
});

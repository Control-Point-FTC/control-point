import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { MemberMention, memberMatches, mentionDecorations, mentionKey } from '../mentionMenu';

const members = [{ id: 1, name: 'Ana Lee' }, { id: 2, name: 'Jenny Park' }, { id: 3, name: 'Ana' }, { id: 4, name: 'Bo' }];

describe('@ mention list', () => {
  it('matches names and their words, names that start with it first, never yourself', () => {
    expect(memberMatches(members, 'je').map(m => m.name)).toEqual(['Jenny Park']);
    expect(memberMatches(members, 'park').map(m => m.name)).toEqual(['Jenny Park']);
    expect(memberMatches(members, 'an').map(m => m.name)).toEqual(['Ana', 'Ana Lee']);
    expect(memberMatches(members, '', 4).map(m => m.id)).not.toContain(4);
  });

  it('typing @ opens the list, Enter writes @Name and pings that member', () => {
    const onMention = vi.fn();
    const editor = new Editor({ extensions: [StarterKit, MemberMention.configure({ members: () => members, selfId: () => 4, enabled: () => true, onMention })], content: '<p>Ask</p>' });
    editor.commands.focus('end');
    editor.commands.insertContent(' @je');
    const state = mentionKey.getState(editor.state)!;
    expect(state).toMatchObject({ active: true, query: 'je' });
    editor.view.someProp('handleKeyDown', f => f(editor.view, new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(editor.getText()).toBe('Ask @Jenny Park ');
    expect(onMention).toHaveBeenCalledWith({ id: 2, name: 'Jenny Park' });
    editor.destroy();
  });

  it("an email address doesn't open the list or get highlighted", () => {
    const editor = new Editor({ extensions: [StarterKit, MemberMention.configure({ members: () => members, selfId: () => undefined, enabled: () => true, onMention: () => {} })], content: '<p>mail bo</p>' });
    editor.commands.focus('end');
    editor.commands.insertContent('@ex');
    expect(mentionKey.getState(editor.state)!.active).toBe(false);
    editor.destroy();
  });

  it('highlights @Name for current members, the longest name first', () => {
    const editor = new Editor({ extensions: [StarterKit], content: '<p>Thanks @Ana Lee and @Bo, not ana@Bo.com or @Bob</p>' });
    const found = mentionDecorations(editor.state.doc, members).find().map(d => editor.state.doc.textBetween(d.from, d.to));
    expect(found).toEqual(['@Ana Lee', '@Bo']);
    editor.destroy();
  });

  it('keeps the list open while a full name is typed', () => {
    const editor = new Editor({ extensions: [StarterKit, MemberMention.configure({ members: () => members, selfId: () => undefined, enabled: () => true, onMention: () => {} })], content: '<p>Ask</p>' });
    editor.commands.focus('end');
    editor.commands.insertContent(' @Jenny Pa');
    expect(mentionKey.getState(editor.state)).toMatchObject({ active: true, query: 'Jenny Pa' });
    editor.commands.insertContent('rk is here');
    expect(mentionKey.getState(editor.state)!.active).toBe(false);
    editor.destroy();
  });

  it('highlights across bold and italic, but not in inline code or after an email-like prefix', () => {
    const editor = new Editor({ extensions: [StarterKit], content: '<p>Ask @Jenny <strong>Park</strong> and <code>@Bo</code> and x.@Bo</p>' });
    const found = mentionDecorations(editor.state.doc, members).find().map(d => editor.state.doc.textBetween(d.from, d.to));
    expect(found).toEqual(['@Jenny Park']);
    editor.destroy();
  });
});

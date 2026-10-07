import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '../../components/ui-kit';

vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), apiFetch: vi.fn(async () => ({ ok: false, json: async () => ({}) })) }));

import { MessageRow } from '../pages/messages/MessageRow';

afterEach(cleanup);
const noop = () => {};

function row(msg: any, mine: boolean, onEdit = vi.fn(async () => true)) {
  render(
    <TooltipProvider>
      <MessageRow
        msg={msg} sender={null} grouped={false} mine={mine} canDelete={false} flash={false} active pickerOpen={false}
        currentUserId={1} memberNames={{}} onRef={noop} onActivate={noop} onReply={noop} onForward={noop} onCopy={noop}
        onDelete={noop} onEdit={onEdit} onOpenPicker={noop} onClosePicker={noop} onPick={noop} onReactionsChange={noop} onJumpTo={noop}
      />
    </TooltipProvider>,
  );
  return onEdit;
}

describe('editing a chat message', () => {
  it('your own message: Edit, change, Enter saves', async () => {
    const onEdit = row({ id: 5, sender_id: 1, sender_name: 'Ada', content: 'helo', timestamp: new Date().toISOString() }, true);
    fireEvent.click(screen.getByRole('button', { name: 'Edit message' }));
    const box = screen.getByRole('textbox', { name: 'Edit message' });
    fireEvent.change(box, { target: { value: 'hello' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(5, 'hello'));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit message' })).not.toBeInTheDocument());
  });

  it('Esc cancels without saving; someone else’s message has no Edit', () => {
    const onEdit = row({ id: 6, sender_id: 1, sender_name: 'Ada', content: 'keep', timestamp: new Date().toISOString() }, true);
    fireEvent.click(screen.getByRole('button', { name: 'Edit message' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit message' }), { key: 'Escape' });
    expect(onEdit).not.toHaveBeenCalled();
    cleanup();
    row({ id: 7, sender_id: 2, sender_name: 'Grace', content: 'theirs', timestamp: new Date().toISOString() }, false);
    expect(screen.queryByRole('button', { name: 'Edit message' })).not.toBeInTheDocument();
  });

  it('shows (edited) on edited messages', () => {
    row({ id: 8, sender_id: 1, sender_name: 'Ada', content: 'changed', edited_at: new Date().toISOString(), timestamp: new Date().toISOString() }, true);
    expect(screen.getByText('(edited)')).toBeInTheDocument();
  });
});

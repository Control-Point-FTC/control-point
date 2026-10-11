// Proof of completion: pasting a screenshot adds it, from anywhere in the
// dialog (the notes box included), whether the browser reports it in
// clipboardData.items or only in clipboardData.files.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { CompletionDialog } from '../pages/tasks/TaskDialogs';

afterEach(cleanup);

function setup() {
  const onFilesChange = vi.fn();
  render(
    <CompletionDialog task={{ id: 1, title: 'Wire the hub' }} notes="" onNotesChange={() => {}} files={[]}
      onFilesChange={onFilesChange} completing={false} onSubmit={() => {}} onClose={() => {}} />,
  );
  return { onFilesChange };
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' });

describe('paste a screenshot as proof', () => {
  it('from items (Chrome, Edge)', async () => {
    const { onFilesChange } = setup();
    const file = png();
    fireEvent.paste(screen.getByLabelText('What was done?'), {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }], files: [file], types: ['Files'] },
    });
    await waitFor(() => expect(onFilesChange).toHaveBeenCalledWith([file]));
  });

  it('from files only (Safari, Firefox)', async () => {
    const { onFilesChange } = setup();
    const file = png();
    fireEvent.paste(screen.getByLabelText('What was done?'), { clipboardData: { items: [], files: [file], types: ['Files'] } });
    await waitFor(() => expect(onFilesChange).toHaveBeenCalledWith([file]));
  });

  it('plain text pastes normally', () => {
    const { onFilesChange } = setup();
    fireEvent.paste(screen.getByLabelText('What was done?'), {
      clipboardData: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }], files: [], types: ['text/plain'] },
    });
    expect(onFilesChange).not.toHaveBeenCalled();
  });

  it('says you can paste', () => {
    setup();
    expect(screen.getByText(/Ctrl\+V|⌘V/)).toBeInTheDocument();
  });
});

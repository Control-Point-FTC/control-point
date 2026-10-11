// Attachments in Messaging: pictures and videos show in place, judged by the
// file's name (stored paths like /api/files/12 have no extension); other
// files stay download cards.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '../../components/ui-kit';

vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), apiFetch: vi.fn(async () => ({ ok: false, json: async () => ({}) })) }));

import { MessageRow } from '../pages/messages/MessageRow';
import { isImageName, isVideoName } from '../../utils/mediaFiles';

afterEach(cleanup);
const noop = () => {};
const at = new Date().toISOString();

function row(msg: any) {
  render(
    <TooltipProvider>
      <MessageRow
        msg={{ id: 1, sender_id: 2, sender_name: 'Grace', content: '', timestamp: at, ...msg }} sender={null} grouped={false} mine={false} canDelete={false} flash={false} active={false} pickerOpen={false}
        currentUserId={1} memberNames={{}} onRef={noop} onActivate={noop} onReply={noop} onForward={noop} onCopy={noop}
        onDelete={noop} onEdit={vi.fn()} onOpenPicker={noop} onClosePicker={noop} onPick={noop} onReactionsChange={noop} onJumpTo={noop}
      />
    </TooltipProvider>,
  );
}

describe('message attachments', () => {
  it('a pasted image.png stored at /api/files/12 shows as a picture', () => {
    row({ file_path: '/api/files/12', file_name: 'image.png', file_size: 295_000 });
    expect(screen.getByRole('img', { name: 'image.png' })).toHaveAttribute('src', expect.stringContaining('/api/files/12'));
  });

  it('a video plays in place, and falls back to a download card if it can’t', () => {
    row({ file_path: '/api/files/13', file_name: 'auto run.mp4', file_size: 4_000_000 });
    const video = document.querySelector('video')!;
    expect(video).toHaveAttribute('src', expect.stringContaining('/api/files/13'));
    expect(video).toHaveAttribute('controls');
    fireEvent.error(video);
    expect(screen.getByText(/Can't play here/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /auto run\.mp4/ })).toHaveAttribute('href', expect.stringContaining('/api/files/13'));
  });

  it('a picture that won’t load keeps a way to open it', () => {
    row({ file_path: '/api/files/15', file_name: 'IMG_9.png', file_size: 1000 });
    fireEvent.error(screen.getByRole('img', { name: 'IMG_9.png' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Can't preview IMG_9.png/ })).toHaveAttribute('href', expect.stringContaining('/api/files/15'));
  });

  it('other files stay download cards', () => {
    row({ file_path: '/api/files/14', file_name: 'BOM.xlsx', file_size: 12_000 });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
    expect(screen.getByRole('link', { name: /BOM\.xlsx/ })).toBeInTheDocument();
  });

  it('name rules', () => {
    expect(isImageName('Screenshot 2026.PNG', '/api/files/1')).toBe(true);
    expect(isImageName(null, '/uploads/a.jpeg')).toBe(true);
    expect(isImageName('notes.pdf', '/api/files/1')).toBe(false);
    expect(isVideoName('clip.MOV', '/api/files/2')).toBe(true);
    expect(isVideoName('clip.webm', null)).toBe(true);
    expect(isVideoName('song.mp3', '/api/files/3')).toBe(false);
  });
});

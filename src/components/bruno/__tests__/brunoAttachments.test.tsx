// Several files in one Bruno message: text and code files are read whole and
// travel in the message (shown as chips), the provider's request size is the
// only limit, and earlier messages' images/PDFs aren't re-sent.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { attachPicked, readAttachments, AttachmentStrip } from '../../BrunoImageAttach';
import { historyForServer } from '../../../services/aiService';
import { UserTurn } from '../../../modern/pages/bruno/BrunoParts';
import { BRUNO_REQUEST_LIMIT_BYTES, withTextFiles } from '../../../utils/brunoFiles';
import * as dialog from '../../dialog';

beforeEach(() => { vi.restoreAllMocks(); });

describe('reading attached files', () => {
  it('reads text and code files whole, PDFs as base64, and skips what Bruno cannot read', async () => {
    const big = 'x'.repeat(300_000);
    const out = await readAttachments([
      new File([big], 'Drive.java', { type: '' }),
      new File(['a,b\n1,2'], 'log.csv', { type: 'text/csv' }),
      new File(['{"k":1}'], 'config.json', { type: 'application/json' }),
      new File(['%PDF-1.4 fake'], 'manual.pdf', { type: 'application/pdf' }),
      new File(['PK'], 'robot.zip', { type: 'application/zip' }),
    ]);
    expect(out.files.map((f) => [f.kind, f.name])).toEqual([['text', 'Drive.java'], ['text', 'log.csv'], ['text', 'config.json'], ['pdf', 'manual.pdf']]);
    expect(out.files[0].kind === 'text' && out.files[0].text).toBe(big);
    expect(out.skipped).toEqual(['robot.zip']);
  });

  it('adds every picked file (no count limit)', async () => {
    const add = vi.fn();
    const files = Array.from({ length: 12 }, (_, i) => new File([`note ${i}`], `n${i}.md`, { type: 'text/markdown' }));
    await attachPicked(files, () => ({ images: [], files: [] }), add);
    expect(add.mock.calls[0][1]).toHaveLength(12);
  });

  it("past the provider's request size: says so and adds nothing", async () => {
    const notify = vi.spyOn(dialog, 'notify').mockImplementation(() => {});
    const add = vi.fn();
    const already = [{ kind: 'pdf' as const, mimeType: 'application/pdf' as const, data: 'A'.repeat(BRUNO_REQUEST_LIMIT_BYTES - 10), name: 'big.pdf', size: 1 }];
    await attachPicked([new File(['y'.repeat(100)], 'more.txt', { type: 'text/plain' })], () => ({ images: [], files: already }), add);
    expect(add).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/more than the 20 MB the AI provider accepts in one message/), 'error');
  });
});

describe('the 100-file limit', () => {
  it('says so and adds nothing past it, keeping what was attached', async () => {
    const notify = vi.spyOn(dialog, 'notify').mockImplementation(() => {});
    const add = vi.fn();
    const pdfs = Array.from({ length: 100 }, (_, i) => ({ kind: 'pdf' as const, mimeType: 'application/pdf' as const, data: 'AAAA', name: `p${i}.pdf`, size: 3 }));
    await attachPicked([new File(['%PDF'], 'one-more.pdf', { type: 'application/pdf' })], () => ({ images: [], files: pdfs }), add);
    expect(add).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/up to 100 images and PDFs in one message/), 'error');
  });
});

describe('chips', () => {
  it('shows each attached file with its own remove button', () => {
    const onRemoveFile = vi.fn();
    render(<AttachmentStrip images={[{ mimeType: 'image/jpeg', data: 'AAAA', name: 'jam.jpg' }]} files={[
      { kind: 'pdf', mimeType: 'application/pdf', data: 'AAAA', name: 'spec.pdf', size: 2048 },
      { kind: 'text', name: 'Intake.kt', text: 'fun x() {}', size: 10 },
    ]} onRemoveImage={() => {}} onRemoveFile={onRemoveFile} />);
    expect(screen.getByRole('button', { name: 'Remove jam.jpg' })).toBeTruthy();
    expect(screen.getByText('spec.pdf')).toBeTruthy();
    screen.getByRole('button', { name: 'Remove Intake.kt' }).click();
    expect(onRemoveFile).toHaveBeenCalledWith(1);
  });

  it("a sent message shows its text files as chips, not their contents", () => {
    const text = withTextFiles('Why does it drift?', [{ name: 'Drive.java', text: 'SECRET_CONTENTS_OF_FILE' }]);
    render(<UserTurn text={`${text}\n\n📎 Attached: field.png`} />);
    expect(screen.getByText('Why does it drift?')).toBeTruthy();
    expect(screen.getByText('Drive.java')).toBeTruthy();
    expect(screen.getByText('field.png')).toBeTruthy();
    expect(screen.queryByText(/SECRET_CONTENTS_OF_FILE/)).toBeNull();
  });
});

describe('what goes to the server', () => {
  it('sends only the turns the server reads, within the request size, never cutting the current message', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ role: (i % 2 ? 'model' : 'user') as 'user' | 'model', text: `m${i}` }));
    expect(historyForServer(many).map((m) => m.text)).toEqual(many.slice(-12).map((m) => m.text));
    const big = 'b'.repeat(BRUNO_REQUEST_LIMIT_BYTES - 100);
    const out = historyForServer([{ role: 'user', text: big }, { role: 'model', text: 'ok' }, { role: 'user', text: 'x'.repeat(5000) }]);
    expect(out.map((m) => m.text.length)).toEqual([5000]); // the oversized old paste and the model turn after it go
  });

  it("earlier images and PDFs aren't sent again; a marker says they were there", () => {
    const out = historyForServer([
      { role: 'user', text: 'look', images: [{ mimeType: 'image/jpeg', data: 'AAAA', name: 'a.jpg' }], pdfs: [{ mimeType: 'application/pdf', data: 'BBBB', name: 'b.pdf' }] },
      { role: 'model', text: 'I see it' },
      { role: 'user', text: 'and now?', images: [{ mimeType: 'image/jpeg', data: 'CCCC', name: 'c.jpg' }] },
    ]);
    expect(out).toEqual([
      { role: 'user', text: 'look\n\n📎 Attached: a.jpg, b.pdf' },
      { role: 'model', text: 'I see it' },
      { role: 'user', text: 'and now?' },
    ]);
  });
});

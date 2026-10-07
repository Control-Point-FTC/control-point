import { describe, expect, it } from 'vitest';
import { parseEmailFile } from '../emailParse';

describe('parseEmailFile', () => {
  it('parses a plain-text email with To/Subject/Date headers', () => {
    const raw = [
      'From: coach@example.org',
      'To: sponsors@example.org',
      'Subject: Build season kickoff',
      'Date: 2026-09-28 14:30',
      '',
      'Hi all,',
      'Kickoff is Saturday.',
    ].join('\n');
    const p = parseEmailFile('email.txt', raw);
    expect(p.recipient).toBe('sponsors@example.org');
    expect(p.subject).toBe('Build season kickoff');
    expect(p.date).toMatch(/^2026-09-28 14:30/);
    expect(p.body).toContain('Kickoff is Saturday');
    expect(p.body).not.toContain('Subject:');
    expect(p.type).toBe('email');
  });

  it('parses a saved HTML page using the title as subject', () => {
    const html = `<html><head><title>Re: Parts order update</title></head>
      <body><script>var x = 1;</script><p>To: parts@example.org</p><p>Your order shipped.</p></body></html>`;
    const p = parseEmailFile('saved.html', html);
    expect(p.subject).toBe('Re: Parts order update');
    expect(p.recipient).toBe('parts@example.org');
    expect(p.body).toContain('Your order shipped');
    expect(p.body).not.toContain('var x');
  });

  it('parses an MHTML saved page (multipart/related)', () => {
    const mhtml = [
      'MIME-Version: 1.0',
      'Content-Type: multipart/related; boundary="----=_NextPart_abc123"',
      '',
      '------=_NextPart_abc123',
      'Content-Type: text/html',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<html><head><title>Team=20dinner</title></head><body>To:=20team@example.org=20<br>Dinner=20at=206.</body></html>',
      '------=_NextPart_abc123--',
    ].join('\r\n');
    const p = parseEmailFile('page.mhtml', mhtml);
    expect(p.subject).toBe('Team dinner');
    expect(p.recipient).toBe('team@example.org');
    expect(p.body).toContain('Dinner at 6');
  });

  it('returns blank fields for an unsupported MHTML part instead of throwing', () => {
    const mhtml = [
      'Content-Type: multipart/related; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/html',
      'Content-Transfer-Encoding: base64',
      '',
      'aGVsbG8=',
      '--b1--',
    ].join('\r\n');
    const p = parseEmailFile('page.mhtml', mhtml);
    expect(p.recipient).toBe('');
    expect(p.subject).toBe('');
  });

  it('handles header-less text by treating it all as body', () => {
    const p = parseEmailFile('note.txt', 'Just some meeting notes\nabout the robot.');
    expect(p.body).toContain('meeting notes');
    expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('never throws on garbage input', () => {
    expect(() => parseEmailFile('x.html', '<html><><><')).not.toThrow();
    expect(() => parseEmailFile('', '')).not.toThrow();
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrunoMarkdown } from '../../BrunoMarkdown';
import { splitRefs } from '../refChips';
afterEach(cleanup);

const block = '\n\n```refs\n{"team":3,"refs":[{"type":"task","id":12,"label":"Wire drivetrain","status":"ok"},{"type":"page","id":31,"label":"Old intake notes","status":"deleted"}]}\n```';
const show = (text: string) => render(<MemoryRouter><BrunoMarkdown>{text}</BrunoMarkdown></MemoryRouter>);

describe('Bruno reference chips', () => {
  it('turns checked references into chips that open the stable link', () => {
    show(`Your [Wire drivetrain](ref:task:12) task is due Friday.${block}`);
    const chip = screen.getByRole('link', { name: 'Wire drivetrain' });
    expect(chip.getAttribute('href')).toBe('/t/3/task/12');
    expect(chip.getAttribute('title')).toBe('Open task: Wire drivetrain');
    expect(screen.queryByText(/```refs|"team":3/)).toBeNull();
  });

  it('shows a deleted record as deleted, not as a link', () => {
    show(`See [Old intake notes](ref:page:31).${block}`);
    expect(screen.queryByRole('link', { name: /Old intake notes/ })).toBeNull();
    expect(screen.getByText('Old intake notes').closest('span[title]')?.getAttribute('title')).toBe('This notebook page was deleted');
  });

  it('leaves unchecked references as plain text (never a guessed link)', () => {
    show(`Maybe [Secret plan](ref:page:40) or [Made up](ref:task:99).${block}`);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/Secret plan/)).toBeTruthy();
  });

  it('hides a half-streamed refs block and still renders normal web links', () => {
    show('Here: [REV](https://www.revrobotics.com/) ```refs\n{"team":3,"re');
    expect(screen.getByRole('link', { name: 'REV' }).getAttribute('href')).toBe('https://www.revrobotics.com/');
    expect(screen.queryByText(/"team"/)).toBeNull();
    expect(splitRefs('no refs').refs).toBeNull();
  });
});

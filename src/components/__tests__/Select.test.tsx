import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { Select } from '../Select';

function Harness({ initial = 'b', onChange }: { initial?: string; onChange?: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <label htmlFor="pick">Fruit</label>
      <Select id="pick" value={v} onChange={(e) => { setV(e.target.value); onChange?.(e.target.value); }}>
        <option value="a">Apple</option>
        <>
          <option value="b">Banana</option>
          {false && <option value="x">Hidden</option>}
        </>
        <option value="c" disabled>Cherry</option>
        {['d', 'e'].map((x) => <option key={x} value={x}>{x === 'd' ? 'Date' : 'Elderberry'}</option>)}
      </Select>
    </>
  );
}

afterEach(cleanup);

describe('Select', () => {
  it('shows the selected label and is associated with its <label>', () => {
    render(<Harness />);
    const box = screen.getByLabelText('Fruit');
    expect(box).toHaveAttribute('role', 'combobox');
    expect(box).toHaveTextContent('Banana');
    expect(box).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on click and selects an option with onChange(e.target.value)', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry']);
    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('option', { name: 'Date' }));
    expect(onChange).toHaveBeenCalledWith('d');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox')).toHaveTextContent('Date');
  });

  it('ignores disabled options', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Cherry' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('supports keyboard: arrows skip disabled, Enter selects, Escape closes', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const box = screen.getByRole('combobox');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(box, { key: 'ArrowDown' }); // Banana -> (skip Cherry) Date
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Date' }).id);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('d');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(box).toHaveAttribute('data-esc-owner');
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(box).not.toHaveAttribute('data-esc-owner');
  });

  it('typeahead jumps to a matching option', () => {
    render(<Harness />);
    const box = screen.getByRole('combobox');
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'e' });
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Elderberry' }).id);
  });

  it('closes on an outside press without changing the value', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts an options array and stringifies values', () => {
    const onChange = vi.fn();
    render(<Select aria-label="Team" value={2} onChange={(e) => onChange(e.target.value)} options={[{ value: 1, label: 'One' }, { value: 2, label: 'Two' }]} />);
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveTextContent('Two');
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'One' }));
    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('does not open when disabled', () => {
    render(<Select aria-label="Off" disabled value="a"><option value="a">A</option></Select>);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

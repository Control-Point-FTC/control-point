import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NotebookRuler, snapToRuler } from '../NotebookRuler';
afterEach(cleanup);
describe('desktop drawing ruler', () => {
  it('snaps near either edge without changing pressure or distant points', () => {
    const ruler = { x: 10, y: 20, angle: 0 };
    expect(snapToRuler([100,23,.7],ruler)).toEqual([100,20,.7]);
    expect(snapToRuler([100,49,.2],ruler)).toEqual([100,52,.2]);
    expect(snapToRuler([100,150,.5],ruler)).toEqual([100,150,.5]);
    expect(snapToRuler([500,21,.5],ruler)).toEqual([500,21,.5]);
  });
  it('projects to a rotated edge in page coordinates', () => {
    expect(snapToRuler([205,100,.8],{ x:10,y:20,angle:90 })).toEqual([206,100,.8]);
  });
  it('rotates with the keyboard without dispatching canvas drawing keys', () => {
    const change = vi.fn(), drawingKeys = vi.fn();
    render(<div onKeyDown={drawingKeys}><NotebookRuler value={{ x:10,y:20,angle:30 }} onChange={change}/></div>);
    fireEvent.keyDown(screen.getByRole('button',{ name:'Rotate ruler' }),{key:'ArrowRight'});
    expect(change).toHaveBeenCalledWith({x:10,y:20,angle:35});
    expect(drawingKeys).not.toHaveBeenCalled();
  });
});

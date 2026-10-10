import React,{useState} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {NotebookZoom} from '../NotebookZoom';
afterEach(cleanup);
function mount(value=100){const changed=vi.fn(),fit=vi.fn();function Host(){const [zoom,setZoom]=useState(value);return <NotebookZoom value={zoom} onChange={next=>{changed(next);setZoom(next);}} onFit={fit}/>;}render(<Host/>);return {changed,fit};}
it('applies custom percentages only on confirmation and rejects invalid values',()=>{
  const {changed}=mount(),input=screen.getByLabelText('Page zoom percentage');fireEvent.change(input,{target:{value:'137'}});expect(changed).not.toHaveBeenCalled();fireEvent.keyDown(input,{key:'Enter'});expect(changed).toHaveBeenLastCalledWith(137);
  for(const value of ['','49','301','100.5','bad']){fireEvent.change(input,{target:{value}});fireEvent.blur(input);expect(screen.getByRole('alert')).toBeTruthy();expect(changed).toHaveBeenCalledOnce();}
  fireEvent.keyDown(input,{key:'Escape'});expect(input).toHaveValue('137');expect(screen.queryByRole('alert')).toBeNull();
});
it('bounds zoom buttons and resets even when a draft is invalid at 100%',()=>{
  const {changed,fit}=mount(50);expect(screen.getByRole('button',{name:'Zoom out'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Zoom in'}));expect(changed).toHaveBeenLastCalledWith(75);
  const input=screen.getByLabelText('Page zoom percentage');fireEvent.change(input,{target:{value:'300'}});fireEvent.blur(input);expect(screen.getByRole('button',{name:'Zoom in'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Reset to 100%'}));
  fireEvent.change(input,{target:{value:'wrong'}});fireEvent.blur(input);fireEvent.click(screen.getByRole('button',{name:'Reset to 100%'}));expect(input).toHaveValue('100');expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Fit width'}));expect(fit).toHaveBeenCalledOnce();
});

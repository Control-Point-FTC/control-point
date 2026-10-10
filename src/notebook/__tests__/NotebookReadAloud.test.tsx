import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {NotebookReadAloud,readingChunks} from '../NotebookReadAloud';
class Utterance {
  voice:SpeechSynthesisVoice|null=null;lang='';rate=1;onend:(()=>void)|null=null;onerror:((event:{error:string})=>void)|null=null;
  constructor(public text:string){}
}
const local={voiceURI:'local-en',name:'Local English',lang:'en-US',localService:true} as SpeechSynthesisVoice;
const remote={voiceURI:'remote-en',name:'Remote English',lang:'en-US',localService:false} as SpeechSynthesisVoice;
function engine(voices=[remote,local]){
  const spoken:Utterance[]=[],fake={getVoices:vi.fn(()=>voices),speak:vi.fn((utterance:Utterance)=>spoken.push(utterance)),cancel:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()};
  vi.stubGlobal('speechSynthesis',fake);vi.stubGlobal('SpeechSynthesisUtterance',Utterance);return {fake,spoken};
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('explicit local notebook read aloud',()=>{
  it('never starts automatically and excludes remote voices',()=>{
    const {fake,spoken}=engine();render(<NotebookReadAloud available getText={()=>'Team discoveries'}/>);
    expect(fake.speak).not.toHaveBeenCalled();expect(screen.queryByText('Remote English · en-US')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));
    expect(spoken[0].voice).toBe(local);expect(spoken[0].text).toBe('Team discoveries');
    expect(screen.getByRole('button',{name:'Stop reading'})).toBeEnabled();
    act(()=>spoken[0].onend?.());expect(screen.getByText('Reading complete.')).toBeTruthy();
  });
  it('stops reading and ignores late callbacks after stopping or unmounting',()=>{
    const {fake,spoken}=engine(),view=render(<NotebookReadAloud available getText={()=>'x'.repeat(2400)}/>);
    fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));fireEvent.click(screen.getByRole('button',{name:'Stop reading'}));
    act(()=>spoken[0].onend?.());expect(spoken).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));view.unmount();
    act(()=>spoken[1].onend?.());expect(spoken).toHaveLength(2);expect(fake.cancel).toHaveBeenCalledTimes(4);
  });
  it('cancels on access loss and reports platform errors',()=>{
    const {fake,spoken}=engine(),view=render(<NotebookReadAloud available getText={()=>'Read this note'}/>);
    fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));view.rerender(<NotebookReadAloud available={false} getText={()=>'Private note'}/>);
    expect(fake.cancel).toHaveBeenCalledTimes(2);expect(screen.getByRole('button',{name:'Read aloud'})).toBeDisabled();
    view.rerender(<NotebookReadAloud available getText={()=>'Read this note'}/>);fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));
    act(()=>spoken[1].onerror?.({error:'audio-busy'}));expect(screen.getByRole('alert')).toHaveTextContent('audio-busy');
    expect(screen.getByRole('button',{name:'Stop reading'})).toBeDisabled();
  });
  it('handles unavailable local voices without falling back to a remote voice',()=>{
    const {fake}=engine([remote]);render(<NotebookReadAloud available getText={()=>'No remote reading'}/>);
    expect(screen.getByRole('button',{name:'Read aloud'})).toBeDisabled();expect(screen.getByRole('status')).toHaveTextContent('No local voice');expect(fake.speak).not.toHaveBeenCalled();
  });
  it('does not continue queued text if the local voice disappears',()=>{
    const {fake,spoken}=engine();render(<NotebookReadAloud available getText={()=>'x'.repeat(2400)}/>);
    fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));fake.getVoices.mockReturnValue([remote]);
    act(()=>spoken[0].onend?.());expect(spoken).toHaveLength(1);expect(screen.getByRole('alert')).toHaveTextContent('without a remote fallback');
  });
  it('rechecks voice locality on explicit start and handles empty or oversized text',()=>{
    const {fake}=engine(),view=render(<NotebookReadAloud available getText={()=>''}/>);
    fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));expect(screen.getByRole('alert')).toHaveTextContent('no typed text');
    view.rerender(<NotebookReadAloud available getText={()=>'x'.repeat(200001)}/>);fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));expect(screen.getByRole('alert')).toHaveTextContent('too large');
    fake.getVoices.mockReturnValue([remote]);fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));expect(screen.getByRole('alert')).toHaveTextContent('local voice is unavailable');expect(fake.speak).not.toHaveBeenCalled();
  });
  it('preserves text and Unicode through bounded sequential utterances',()=>{
    const text='Astronaut 🚀 '.repeat(300),chunks=readingChunks(text);expect(chunks.join('')).toBe(text.trim());expect(chunks.every(c=>Array.from(c).length<=1200)).toBe(true);
    const {spoken}=engine();render(<NotebookReadAloud available getText={()=>text}/>);fireEvent.change(screen.getByLabelText('Read-aloud speed'),{target:{value:'1.25'}});fireEvent.click(screen.getByRole('button',{name:'Read aloud'}));
    for(let i=0;i<chunks.length;i++){expect(spoken[i].voice).toBe(local);expect(spoken[i].rate).toBe(1.25);act(()=>spoken[i].onend?.());}
    expect(spoken.map(u=>u.text).join('')).toBe(text.trim());expect(screen.getByText('Reading complete.')).toBeTruthy();
  });
});

import React,{useEffect,useRef,useState} from 'react';

const MAX_SPOKEN_TEXT=200000;
export function readingChunks(text:string):string[] {
  if(text.length>MAX_SPOKEN_TEXT)throw new Error('This page is too large to read aloud. Read a smaller page.');
  // Short utterances avoid platform truncation; do not split surrogate pairs.
  const chars=Array.from(text.trim()),chunks:string[]=[];
  while(chars.length){let end=Math.min(1200,chars.length);if(end<chars.length){for(let i=end-1;i>600;i--)if(/[\s.!?]/.test(chars[i])){end=i+1;break;}}chunks.push(chars.splice(0,end).join(''));}
  return chunks;
}

/** Explicit speech with local platform voices only. Never use a remote default. */
export function NotebookReadAloud({getText,available}:{getText:()=>string;available:boolean}) {
  const [voices,setVoices]=useState<SpeechSynthesisVoice[]>([]),[voiceId,setVoiceId]=useState(''),[rate,setRate]=useState(1);
  const [running,setRunning]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState('');
  const generation=useRef(0),active=useRef(false),text=useRef(getText);text.current=getText;
  const supported=typeof window!=='undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const stop=()=>{generation.current++;if(active.current)window.speechSynthesis.cancel();active.current=false;setRunning(false);setProgress('Reading stopped.');};
  useEffect(()=>{
    if(!supported)return;
    const engine=window.speechSynthesis;
    const load=()=>{try{const local=engine.getVoices().filter(voice=>voice.localService);setVoices(local);setVoiceId(id=>local.some(v=>v.voiceURI===id)?id:local[0]?.voiceURI??'');}catch{setError('Local voices are unavailable in this browser.');}};
    load();engine.addEventListener('voiceschanged',load);
    return ()=>{engine.removeEventListener('voiceschanged',load);generation.current++;if(active.current)engine.cancel();active.current=false;};
  },[supported]);
  useEffect(()=>{if(!available && active.current)stop();},[available]);
  const start=()=>{
    if(!supported||!available||running)return;
    const engine=window.speechSynthesis;
    try{
      // Recheck localService immediately before speaking, not just in the picker.
      const voice=engine.getVoices().find(v=>v.voiceURI===voiceId && v.localService);
      if(!voice)throw new Error('The selected local voice is unavailable. Choose another voice.');
      const chunks=readingChunks(text.current());if(!chunks.length)throw new Error('This page has no typed text to read aloud.');
      const token=++generation.current;engine.cancel();active.current=true;setRunning(true);setError('');
      const speak=(index:number)=>{
        if(token!==generation.current)return;
        if(index===chunks.length){active.current=false;setRunning(false);setProgress('Reading complete.');return;}
        let currentVoice:SpeechSynthesisVoice|undefined;
        try{currentVoice=engine.getVoices().find(v=>v.voiceURI===voice.voiceURI && v.localService);}catch{/* Treat failed voice discovery as unavailable. */}
        if(!currentVoice){generation.current++;active.current=false;engine.cancel();setRunning(false);setError('The local voice is no longer available. Reading stopped without a remote fallback.');return;}
        const utterance=new SpeechSynthesisUtterance(chunks[index]);utterance.voice=currentVoice;utterance.lang=currentVoice.lang;utterance.rate=rate;
        utterance.onend=()=>speak(index+1);
        utterance.onerror=event=>{if(token!==generation.current)return;generation.current++;active.current=false;setRunning(false);setError(`Reading stopped (${event.error || 'speech unavailable'}). Try another local voice.`);};
        setProgress(`Reading part ${index+1} of ${chunks.length}`);
        try{engine.speak(utterance);}catch{generation.current++;active.current=false;engine.cancel();setRunning(false);setError('This browser could not start local speech.');}
      };
      speak(0);
    }catch(e){generation.current++;if(active.current)engine.cancel();active.current=false;setRunning(false);setError(e instanceof Error?e.message:'Cannot read this page aloud.');}
  };
  if(!supported)return <p role="status">Read aloud is unavailable in this browser.</p>;
  return <div className="nb-reader-speech" aria-label="Local read aloud">
    <label>Local voice <select aria-label="Read-aloud voice" disabled={running||!voices.length} value={voiceId} onChange={e=>setVoiceId(e.target.value)}>{voices.map(voice=><option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}</select></label>
    <label>Speed <select aria-label="Read-aloud speed" disabled={running} value={rate} onChange={e=>setRate(Number(e.target.value))}>{[.75,1,1.25,1.5].map(n=><option key={n} value={n}>{n}×</option>)}</select></label>
    <button disabled={running||!available||!voices.length} onClick={start}>Read aloud</button><button disabled={!running} onClick={stop}>Stop reading</button>
    {!voices.length && <p role="status">No local voice is installed or ready. Remote voices are excluded.</p>}
    {progress&&<span role="status" aria-live="polite">{progress}</span>}{error&&<p role="alert">{error}</p>}
  </div>;
}

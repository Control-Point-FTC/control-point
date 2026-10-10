import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {NotebookPage} from '../../src/notebook/NotebookPage';
import '../../src/index.css';import '../../src/modern/modern.css';
function Fixture(){
  const [generation,setGeneration]=useState(0),[member,setMember]=useState(1),[working,setWorking]=useState(false);
  const connection=async(offline:boolean)=>{setWorking(true);try{await fetch(`/_fixture/connection?offline=${offline?'1':'0'}`);setGeneration(n=>n+1);}finally{setWorking(false);}};
  return <><header style={{padding:12,background:'#222',color:'white'}}><strong>Synthetic offline notebook — no account or real team data</strong><button disabled={working} onClick={()=>void connection(true)}>Disconnect and remount notebook</button><button disabled={working} onClick={()=>void connection(false)}>Reconnect and remount notebook</button><button onClick={()=>setMember(n=>n===1?2:1)}>Switch synthetic account</button></header><div style={{height:'calc(100vh - 70px)'}}><MemoryRouter key={generation} initialEntries={['/notebook?page=1']}><NotebookPage activeTeamId={1} currentUserId={member}/></MemoryRouter></div></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

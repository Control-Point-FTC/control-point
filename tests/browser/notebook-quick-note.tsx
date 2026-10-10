import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {NotebookQuickNote} from '../../src/notebook/NotebookQuickNote';
import type {NotebookTree} from '../../src/notebook/types';
import '../../src/index.css';
import '../../src/modern/modern.css';
import '../../src/notebook/notebook.css';
const tree:NotebookTree={notebooks:[{id:1,title:'Synthetic season',sort:0,color:null}],sections:[{id:1,notebookId:1,title:'Team discoveries',sort:0,color:null,protected:false,defaultTemplate:null,dateStamp:false},{id:2,notebookId:1,title:'Admin notes',sort:1,color:null,protected:true,defaultTemplate:null,dateStamp:false}],pages:[],permissions:{read:true,edit:true,organize:true,delete:true,protect:true}};
function Fixture(){const [saved,setSaved]=useState(false);return <main style={{padding:32}}><h1>Synthetic desktop quick capture</h1><p>No account or real team data. The synthetic API creates a placeholder page.</p><NotebookQuickNote tree={tree} teamId={1} sectionId={1} onSaved={()=>setSaved(true)} onOpen={id=>alert(`Synthetic page ${id}`)}/>{saved&&<p>Capture completed; the current editor would remain mounted.</p>}</main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);

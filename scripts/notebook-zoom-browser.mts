/** Reproducible real-browser geometry regression, without user accounts/data.
 * Run: node --import tsx scripts/notebook-zoom-browser.mts
 * Open the printed URL and click Run real Fit Width checks. PASS includes actual
 * measured bounds at two writing-area widths. No real server is contacted.
 */
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import * as Y from 'yjs';
import { prosemirrorJSONToYDoc } from '@tiptap/y-tiptap';
import { notebookSchema } from '../src/notebook/editorSchema';
import { insertCanvasItem } from '../src/notebook/canvasModel';
const doc = prosemirrorJSONToYDoc(notebookSchema, {type:'doc',content:[{type:'paragraph',attrs:{id:'fixture-paragraph'},content:[{type:'text',text:'Real rendered drawing geometry; no mocked browser widths.'}]}]});
doc.getMap('meta').set('title','Synthetic oversized drawing');
insertCanvasItem(doc,{id:'oversized-drawing',type:'shape',shape:'rectangle',x:650,y:140,width:650,height:360,z:1,rotation:0,locked:false,groupId:null,color:'#007c91',fill:'#c6edf3',strokeWidth:3});
const bytes = (value:Uint8Array) => Buffer.from(value).toString('base64');
let disconnected=false;
const fixtureTree={notebooks:[{id:1,title:'Synthetic season',color:'#007c91',sort:0}],sections:[{id:1,notebookId:1,title:'Team discoveries',color:'#007c91',sort:0,protected:false,defaultTemplate:null,dateStamp:false},{id:2,notebookId:1,title:'Admin notes',color:'#777777',sort:1,protected:true,defaultTemplate:null,dateStamp:false}],pages:[{id:1,sectionId:1,parentId:null,title:'Synthetic oversized drawing',sort:0,protected:false,ownProtected:false,revision:1,updatedAt:'2026-10-10T00:00:00Z'},{id:2,sectionId:2,parentId:null,title:'Protected synthetic page',sort:0,protected:true,ownProtected:false,revision:1,updatedAt:'2026-10-10T00:00:00Z'}],permissions:{read:true,edit:true,organize:true,delete:true,protect:true}};
const server = await createServer({configFile:false,root:process.cwd(),plugins:[react(),tailwindcss(),{name:'synthetic-notebook-api',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/_fixture/connection')){disconnected=new URL(req.url,'http://fixture').searchParams.get('offline')==='1';res.setHeader('Content-Type','application/json');res.end(JSON.stringify({disconnected}));return;}
  if(!req.url?.startsWith('/api/'))return next();
  if(disconnected){req.socket.destroy();return;}
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.url==='/api/notebook/tree')res.end(JSON.stringify(fixtureTree));
  else if(req.url==='/api/notebook/pages'&&req.method==='POST')res.end(JSON.stringify({id:100}));
  else if(req.url==='/api/notebook/pages/1/sync'){
    let raw='';for await(const chunk of req)raw+=chunk;
    try { const body=JSON.parse(raw||'{}');if(body.update)Y.applyUpdate(doc,Buffer.from(body.update,'base64'));
      res.end(JSON.stringify({epoch:'fixture',update:bytes(Y.encodeStateAsUpdate(doc)),vector:bytes(Y.encodeStateVector(doc)),title:doc.getMap('meta').get('title'),revision:1,protected:false,editable:true,updatedBy:1,updatedAt:'2026-10-10T00:00:00Z',peers:[]}));
    }catch{res.statusCode=400;res.end(JSON.stringify({error:'Invalid synthetic update'}));}
  }else if(req.url?.includes('/threads'))res.end(JSON.stringify({items:[],next:null,canComment:false}));
  else res.end('[]');
});}}],server:{host:'127.0.0.1',port:0}});
await server.listen();
console.log(`${server.resolvedUrls?.local[0]}tests/browser/notebook-zoom.html`);
process.on('SIGINT',()=>{void server.close().then(()=>{doc.destroy();process.exit(0);});});

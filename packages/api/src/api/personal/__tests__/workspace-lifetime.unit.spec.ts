import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'

// Execute the shipped browser script; scheduling is controlled, not authorization.
function harness() {
  const source=readFileSync(join(__dirname,'../route.ts'),'utf8')
  const nodes=new Map<string,any>(),listeners=new Map<string,Function>(),pending:any[]=[]
  const el=(id:string)=>{
    if(!nodes.has(id))nodes.set(id,{textContent:'',value:'',hidden:id==='workspace',children:[],elements:{method:{}},replaceChildren(){this.textContent='';this.children=[]},append(x:any){this.children.push(x)},querySelectorAll(){return []},reset(){},querySelector(){return {disabled:false}}})
    return nodes.get(id)
  }
  const document={hidden:false,getElementById:el,createElement:()=>({textContent:''}),addEventListener:(n:string,f:Function)=>listeners.set(n,f)}
  const context=createContext({document,window:{addEventListener:(n:string,f:Function)=>listeners.set(n,f)},location:new URL('https://app.example.invalid/personal'),URL,history:{replaceState(){}},URLSearchParams,setInterval:(f:Function)=>listeners.set('poll',f),fetch:(path:string,options:any)=>new Promise(resolve=>pending.push({path,options,resolve}))})
  const scripts=[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1])
  // Execute the early token capture too; workspace lifetime keeps its original assertions.
  for(const script of scripts)runInContext(script,context)
  runInContext('links=async()=>{};refreshMfa=async()=>{};refreshSmtp=async()=>{}',context)
  return {context,el,pending,listeners,document}
}
const tick=()=>new Promise<void>(r=>setImmediate(r))
async function answer(h:ReturnType<typeof harness>,path:string,data:any,ok=true){const p=h.pending.find(p=>p.path===path&&!p.answered)!;p.answered=true;p.resolve({ok,status:ok?200:403,json:async()=>data});await tick()}
async function loaded(h:ReturnType<typeof harness>){await answer(h,'/personal/session',{person_id:'private-person',csrf_token:'csrf'});await answer(h,'/personal/organizations',{person_id:'private-person',organizations:[{id:'A',name:'private-org',role:'owner'}]})}

describe('private workspace lifetime (script regression only)',()=>{
  it('polls with the no-touch header, stops while hidden, and clears private DOM',async()=>{
    const h=harness();await loaded(h)
    expect(h.el('workspace').hidden).toBe(false)
    const poll=h.listeners.get('poll')!();await tick()
    expect(h.pending.at(-1).options.headers['x-da-observe']).toBe('1')
    await answer(h,'/personal/organizations',{person_id:'private-person',organizations:[{id:'A',name:'private-org',role:'owner'}]});await poll
    h.document.hidden=true;h.listeners.get('visibilitychange')!()
    expect(h.el('workspace').hidden).toBe(true);expect(h.el('person').textContent).toBe('');expect(h.el('organizations').children).toHaveLength(0)
    const count=h.pending.length;await h.listeners.get('poll')!();expect(h.pending).toHaveLength(count)
  })
  it('ignores a private response that completes after pagehide',async()=>{
    const h=harness();await answer(h,'/personal/session',{person_id:'private-person',csrf_token:'csrf'})
    h.listeners.get('pagehide')!()
    await answer(h,'/personal/organizations',{person_id:'private-person',organizations:[{id:'A',name:'old-secret',role:'owner'}]})
    expect(h.el('workspace').hidden).toBe(true);expect(h.el('organizations').children).toHaveLength(0);expect(h.el('person').textContent).toBe('')
  })
  it('conceals before revalidating persisted browser history',async()=>{
    const h=harness();await loaded(h)
    h.listeners.get('pageshow')!({persisted:true})
    expect(h.el('workspace').hidden).toBe(true);expect(h.el('person').textContent).toBe('')
    expect(h.pending.at(-1).path).toBe('/personal/session')
  })
  it('clears private context when the visible observer is denied',async()=>{
    const h=harness();await loaded(h)
    const poll=h.listeners.get('poll')!();await tick();await answer(h,'/personal/organizations',{message:'Access denied'},false);await poll
    expect(h.el('workspace').hidden).toBe(true);expect(h.el('organizations').children).toHaveLength(0);expect(h.el('person').textContent).toBe('')
  })
  it('does not touch the session by automatically loading after an observed scope change',async()=>{
    const h=harness();await loaded(h)
    const poll=h.listeners.get('poll')!();await tick();await answer(h,'/personal/organizations',{person_id:'private-person',organizations:[]});await poll
    expect(h.el('workspace').hidden).toBe(true)
    expect(h.pending.filter(p=>p.path==='/personal/session')).toHaveLength(1)
    expect(h.el('person').textContent).toBe('')
  })

})

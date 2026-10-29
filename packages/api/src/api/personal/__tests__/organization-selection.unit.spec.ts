import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'

// Execute the shipped UI functions, with controlled response scheduling only.
// This is a UI race regression, not browser/HTTP/database authorization proof.
function harness() {
  const source=readFileSync(join(__dirname,'../route.ts'),'utf8')
  const begin=source.indexOf("let currentOrg=''")
  const end=source.indexOf('  async function load()',begin)
  const nodes=new Map<string,any>()
  const el=(id:string)=>{if(!nodes.has(id))nodes.set(id,{textContent:'',children:[],replaceChildren(){this.children=[]},append(x:any){this.children.push(x)}});return nodes.get(id)}
  const pending:Array<{path:string;resolve:(x:any)=>void;reject:(e:Error)=>void}>=[]
  const state={status:'',url:'/personal',pending,el}
  const context=createContext({el,clearNotifications:()=>{el('notification-list').replaceChildren();el('notification-bell').hidden=true},notifications:async()=>{},status:(s:string)=>{state.status=s},history:{replaceState:(_:unknown,__:unknown,url:string)=>{state.url=url}},document:{createElement:()=>({textContent:''})},api:(path:string)=>new Promise((resolve,reject)=>pending.push({path,resolve,reject}))})
  runInContext(source.slice(begin,end),context)
  return {...state,context,state,select:(id:string)=>runInContext(`selectOrg(${JSON.stringify(id)})`,context)}
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve))
const org=(id:string)=>({organizations:[{id,name:id,role:'owner'}]})

describe('Organization selection response ordering (UI-only)',()=>{
  it('keeps the latest selection when an older read resolves last',async()=>{
    const h=harness(),a=h.select('A'),b=h.select('B')
    h.pending[1].resolve(org('B'));await settle()
    h.pending.find(p=>p.path==='memberships?organization=B')!.resolve({memberships:[]});await b
    h.pending[0].resolve(org('A'));await settle()
    h.pending.find(p=>p.path==='memberships?organization=A')?.resolve({memberships:[]});await a
    expect(h.state.url).toBe('/personal?organization=B')
    expect(JSON.parse(h.el('detail').textContent).id).toBe('B')
  })
  it('does not restore a previous scope after the new selection is denied',async()=>{
    const h=harness(),a=h.select('A'),b=h.select('foreign')
    h.pending[1].reject(new Error('Access denied'));await b
    h.pending[0].resolve(org('A'));await settle()
    h.pending.find(p=>p.path==='memberships?organization=A')?.resolve({memberships:[]});await a
    expect(h.el('detail').textContent).toBe('')
    expect(h.state.url).toBe('/personal')
    expect(h.state.status).toBe('Access denied')
  })
  it('hides the previous invitation controls before a denied selection',async()=>{
    const h=harness(),a=h.select('A')
    h.pending[0].resolve(org('A'));await settle();h.pending.find(p=>p.path==='memberships?organization=A')!.resolve({memberships:[]});await a
    expect(h.el('invite-member').hidden).toBe(false)
    h.el('invite-result').textContent='old recipient context'
    const b=h.select('foreign')
    expect(h.el('invite-member').hidden).toBe(true)
    expect(h.el('invite-result').textContent).toBe('')
    h.pending.find(p=>p.path==='organizations?id=foreign')!.reject(new Error('Access denied'));await b
    expect(h.el('invite-member').hidden).toBe(true)
  })
  it('ignores late membership data from a superseded Organization',async()=>{
    const h=harness(),a=h.select('A')
    h.pending[0].resolve(org('A'));await settle()
    const b=h.select('B');h.pending.find(p=>p.path==='organizations?id=B')!.resolve(org('B'));await settle()
    h.pending.find(p=>p.path==='memberships?organization=B')!.resolve({memberships:[]});await b
    h.pending.find(p=>p.path==='memberships?organization=A')!.resolve({memberships:[{person_id:'old-person',role:'member',status:'active',id:'old-member'}]});await a
    expect(h.el('memberships').children).toHaveLength(0)
    expect(h.state.url).toBe('/personal?organization=B')
  })
})

describe('B22 selected Organization Store presentation (UI scheduling, not API authority)',()=>{
  const finishSelection=async(h:ReturnType<typeof harness>,id:string,call:Promise<unknown>)=>{
    h.pending.find(p=>p.path==='organizations?id='+id)!.resolve(org(id))
    await settle()
    h.pending.find(p=>p.path==='memberships?organization='+id)!.resolve({memberships:[]})
    await call
  }

  it('shows only the selected Organization response and ignores an earlier Organization response',async()=>{
    const h=harness()
    const a=h.select('A');await finishSelection(h,'A',a)
    const pendingA=h.pending.find(p=>p.path==='organization-stores?organization=A')!
    const b=h.select('B')
    expect(h.el('org-stores-panel').hidden).toBe(true)
    expect(h.el('org-stores').children).toHaveLength(0)
    await finishSelection(h,'B',b)
    const pendingB=h.pending.find(p=>p.path==='organization-stores?organization=B')!
    pendingB.resolve({organization_id:'B',stores:[{id:'sel_B',name:'B Mağazası'}]})
    await settle()
    pendingA.resolve({organization_id:'A',stores:[{id:'sel_A',name:'A Özel Mağazası'}]})
    await settle()
    expect(h.el('org-stores').children).toHaveLength(1)
    expect(h.el('org-stores').children[0].textContent).toContain('B Mağazası')
    expect(h.el('org-stores').children[0].textContent).not.toContain('A Özel')
  })

  it('clears the previous Store view immediately on a denied Organization switch',async()=>{
    const h=harness(),a=h.select('A')
    await finishSelection(h,'A',a)
    h.pending.find(p=>p.path==='organization-stores?organization=A')!.resolve({organization_id:'A',stores:[{id:'sel_A',name:'Özel A'}]})
    await settle()
    expect(h.el('org-stores').children).toHaveLength(1)
    const failed=h.select('foreign')
    expect(h.el('org-stores').children).toHaveLength(0)
    expect(h.el('org-stores-panel').hidden).toBe(true)
    h.pending.find(p=>p.path==='organizations?id=foreign')!.reject(new Error('Access denied'))
    await failed
    expect(h.el('org-stores').children).toHaveLength(0)
  })

  it('fails closed on malformed Store response and never renders private fields',async()=>{
    const h=harness(),a=h.select('A');await finishSelection(h,'A',a)
    const pending=h.pending.find(p=>p.path==='organization-stores?organization=A')!
    pending.resolve({organization_id:'A',stores:[{id:'sel_A',name:'A',privateEmail:'hidden@example.invalid'},{id:'sel_A',name:'duplicate'}]})
    await settle()
    expect(h.el('org-stores').children).toHaveLength(0)
    expect(h.el('org-stores-status').textContent).toContain('doğrulanamadı')
  })
})

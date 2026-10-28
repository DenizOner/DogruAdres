/* B20 decisive integration probe. Owns a fresh tmpfs PG16 container; never reuses acceptance DBs. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {createRequire}=require('node:module');
const assert=require('node:assert/strict');
const api=path.resolve(__dirname,'..'),root=path.resolve(api,'../..');
process.chdir(api);
const req=createRequire(path.join(api,'package.json'));
const id=crypto.randomBytes(8).toString('hex'),name='da-b20-'+id;
const dir=path.join(api,'.cache',name);fs.mkdirSync(dir,{recursive:false});
const record=(n,v)=>fs.writeFileSync(path.join(dir,n+'.json'),JSON.stringify(v,null,2),{flag:'wx'});
function run(exe,args,opts={}){const r=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,...opts});assert.equal(r.status,0,r.stderr||r.error?.message||'Command failed');return r.stdout;}
const head=run('git',['rev-parse','HEAD']).trim();
assert.ok(/^[a-f0-9]{40}$/.test(process.env.B20_EXPECTED_HEAD||''),'Set B20_EXPECTED_HEAD to the approved exact revision');
assert.equal(head,process.env.B20_EXPECTED_HEAD);
assert.equal(run('git',['branch','--show-current']).trim(),'feature/m0-identity-session-ingress-vertical');
const baseline=run('git',['status','--porcelain=v1']);
const protectedPaths=['evidence-b09','evidence-b16'].map(p=>path.join(api,p));
function digestTree(p){const rows=[];function walk(p){for(const d of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,d.name);assert.ok(!d.isSymbolicLink());if(d.isDirectory())walk(f);else rows.push([path.relative(api,f),crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]);}}walk(p);return rows;}
const protectedBefore=protectedPaths.flatMap(digestTree);
record('manifest.private',{owner:'B20 /root sole writer',root,api,head,commonDir:run('git',['rev-parse','--git-common-dir']).trim(),baseline,container:name,expiry:'Retire after decisive probe; retain evidence',protectedBefore});
const password=crypto.randomBytes(32).toString('hex');
let containerId;
function assertOwnedTmpfs(c){
  assert.equal(c.Id,containerId);assert.equal(c.Name,'/'+name);
  assert.equal(c.Config.Labels['org.dogruadres.owner'],id);
  assert.deepEqual(c.HostConfig.Tmpfs,{'/var/lib/postgresql/data':'rw'});
  assert.ok(c.Mounts.every(m=>m.Type==='tmpfs'&&m.Destination==='/var/lib/postgresql/data'));
}
try{
  containerId=run('docker',['run','-d','--name',name,'--label','org.dogruadres.task=B20','--label','org.dogruadres.owner='+id,'--memory','512m','--cpus','1','--tmpfs','/var/lib/postgresql/data:rw','-p','127.0.0.1::5432','-e','POSTGRES_USER=b20_test','-e','POSTGRES_DB=b20_'+id,'-e','POSTGRES_PASSWORD='+password,'postgres:16-alpine']).trim();
  const c=JSON.parse(run('docker',['inspect',containerId]))[0];
  assertOwnedTmpfs(c);
  const binding=c.NetworkSettings.Ports['5432/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');
  const filesystem=run('docker',['exec',containerId,'stat','-f','-c','%T','/var/lib/postgresql/data']).trim();assert.equal(filesystem,'tmpfs');
  record('container',{id:containerId,name,mounts:c.Mounts,tmpfs:c.HostConfig.Tmpfs,filesystem,port:binding,db:'b20_'+id});
  let ready=false;for(let i=0;i<40;i++){const r=spawnSync('docker',['exec',containerId,'pg_isready','-U','b20_test','-d','b20_'+id],{encoding:'utf8',windowsHide:true});if(r.status===0){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,250);}assert.ok(ready);
  // ts-node's supported compiler option avoids every historical SWC cache.
  const project=path.join(dir,'tsconfig.json');fs.writeFileSync(project,JSON.stringify({extends:path.join(api,'tsconfig.json'), 'ts-node':{swc:false,transpileOnly:true}}));
  const guard=path.join(dir,'guard.cjs');
  fs.writeFileSync(guard,`
const fs=require('node:fs'),net=require('node:net'),tls=require('node:tls'),path=require('node:path');
const read=fs.readFileSync,exists=fs.existsSync;
const envFile=p=>typeof p==='string'&&/^\\.env(?:\\.|$)/.test(path.basename(p));
fs.existsSync=function(p){return envFile(p)?false:exists.apply(this,arguments)};
fs.readFileSync=function(p){if(envFile(p)){const e=Error('B20_ENV_FILE_FORBIDDEN');e.code='ENOENT';throw e}return read.apply(this,arguments)};
function check(args){const a=args[0];let host,port;if(typeof a==='object'&&a){if(a.path)return;host=a.host||a.hostname||'localhost';port=a.port}else if(typeof a==='number'){port=a;host=typeof args[1]==='string'?args[1]:'localhost'}else throw Error('B20_SOCKET_FORM_DENIED');if(!['127.0.0.1','::1','localhost'].includes(host)||[1,25,465,587].includes(Number(port)))throw Error('B20_EXTERNAL_EGRESS_DENIED')}
const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){check(Array.isArray(args[0])?args[0]:args);return connect.apply(this,args)};
const tlsConnect=tls.connect;tls.connect=function(...args){check(args);return tlsConnect.apply(this,args)};
`,{flag:'wx'});
  const env={...process.env,TS_NODE_PROJECT:project,NODE_OPTIONS:'--use-system-ca --require='+guard,
    DATABASE_URL:'postgres://b20_test:'+password+'@127.0.0.1:'+binding.HostPort+'/b20_'+id,
    NODE_ENV:'test',MEDUSA_DISABLE_TELEMETRY:'true',JWT_SECRET:crypto.randomBytes(48).toString('hex'),COOKIE_SECRET:crypto.randomBytes(48).toString('hex'),
    DOGRUADRES_MFA_ENCRYPTION_KEY:crypto.randomBytes(48).toString('hex'),DOGRUADRES_INVITATION_SECRET:crypto.randomBytes(48).toString('hex'),
    DOGRUADRES_IDENTITY_ENABLED:'true',DOGRUADRES_MFA_RUNTIME_ENABLED:'true',DOGRUADRES_MFA_ENROLLMENT_ENABLED:'true',DOGRUADRES_MFA_SETTINGS_ENABLED:'true',
    DOGRUADRES_PUBLIC_ORIGIN:'http://127.0.0.1:19872',DOGRUADRES_PRIVATE_API:'http://127.0.0.1:19873',DOGRUADRES_FRONTDOOR_HOST:'127.0.0.1',DOGRUADRES_FRONTDOOR_PORT:'19872',
    STORE_CORS:'http://127.0.0.1',ADMIN_CORS:'http://127.0.0.1',VENDOR_CORS:'http://127.0.0.1',AUTH_CORS:'http://127.0.0.1',SMTP_ENABLED:'false',
    B20_DIR:dir,B19_DIR:dir,B20_HEAD:head,B20_DATABASE:'b20_'+id};
  const cli=path.join(path.dirname(req.resolve('@medusajs/cli/package.json')),'cli.js');
  const probe=process.env.B20_LAUNCHER==='true'
    ?'integration-tests/postgres/b20-launcher.exec.ts'
    :process.env.B20_STOREFRONT_ONLY==='true'
    ?'integration-tests/postgres/b20-storefront.exec.ts'
    :'integration-tests/postgres/b20-native-targets.exec.ts';
  const timeout=process.env.B20_LAUNCHER==='true'?300000:process.env.B20_STOREFRONT_ONLY==='true'?360000:180000;
  for(const [label,args] of [['migrate',['db:migrate']],['probe',['exec',probe]]]){
    const log=fs.openSync(path.join(dir,label+'.log'),'wx');let result;
    try{result=spawnSync(process.execPath,[cli,...args],{cwd:api,env,stdio:['ignore',log,log],timeout,windowsHide:true});}finally{fs.closeSync(log);}
    record(label+'-exit',{status:result.status,error:result.error?.message});
    assert.equal(result.status,0,label+' failed; see private '+dir);
  }
}finally{
  if(containerId){const c=JSON.parse(run('docker',['inspect',containerId]))[0];assertOwnedTmpfs(c);run('docker',['stop',containerId]);run('docker',['rm',containerId]);record('cleanup',{containerId,removed:true,taskOwnedTmpfsOnly:true});}
  assert.deepEqual(protectedPaths.flatMap(digestTree),protectedBefore);record('protected-readback',{unchanged:true,files:protectedBefore.length});
  console.log('B20 private evidence: '+dir);
}

// Authorized B19-only disposable PG16 runner. No existing database is migrated.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const api=path.resolve(__dirname,'../..'),root=path.resolve(api,'../..');
const req=require('node:module').createRequire(path.join(api,'package.json'));
const {Client}=req('@medusajs/framework/pg');
const dir=path.join(api,'.cache/b19-private-20261028-01');
const j=(n,v)=>fs.writeFileSync(path.join(dir,n+'.json'),JSON.stringify(v,null,2),{flag:'wx'});
const git=(...a)=>cp.execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function protectedFiles(){
  const roots=[];
  for(const parent of [path.join(root,'.cache'),path.join(api,'.cache')])
    for(const e of fs.readdirSync(parent,{withFileTypes:true}))
      if(e.isDirectory()&&/^b(0[1-9]|1[0-8])/.test(e.name))roots.push(path.join(parent,e.name));
  for(const name of ['evidence-b09','evidence-b16'])roots.push(path.join(api,name));
  const files=[];
  function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){
    const f=path.join(p,e.name);if(e.isDirectory())walk(f);else if(e.isFile())files.push({path:f,sha256:hash(f)});
  }}
  for(const p of roots)walk(p);
  for(const e of fs.readdirSync(__dirname))if(/^b(09|16|18)/.test(e))files.push({path:path.join(__dirname,e),sha256:hash(path.join(__dirname,e))});
  return files;
}
async function main(){
  assert.equal(git('branch','--show-current'),'feature/m0-identity-session-ingress-vertical');
  const manifestPath=path.join(dir,'manifest.private.json');
  let m;
  if(fs.existsSync(manifestPath))m=JSON.parse(fs.readFileSync(manifestPath));
  else {
    assert.equal(git('rev-parse','HEAD'),'842d685259f64d76ff88c70f526c918f04348fe9');
    const inspect=JSON.parse(cp.execFileSync('docker',['inspect','da-b09-20261027-14a64355'],{encoding:'utf8'}))[0];
    assert.equal(inspect.Config.Image,'postgres:16-alpine');assert.ok(inspect.State.Running);
    assert.ok(inspect.Mounts.every(x=>x.Type==='tmpfs'));
    const port=inspect.NetworkSettings.Ports['5432/tcp'][0];assert.equal(port.HostIp,'127.0.0.1');
    const env=Object.fromEntries(inspect.Config.Env.map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)]}));
    const u=new URL('postgres://127.0.0.1:'+port.HostPort+'/postgres');u.username=env.POSTGRES_USER;u.password=env.POSTGRES_PASSWORD;
    const admin=new Client({connectionString:u.href});await admin.connect();
    const identity=(await admin.query('select version(),system_identifier::text from pg_control_system()')).rows[0];
    assert.match(identity.version,/PostgreSQL 16\./);
    const db='b19_'+crypto.randomBytes(8).toString('hex');
    assert.equal((await admin.query('select 1 from pg_database where datname=$1',[db])).rowCount,0);
    m={owner:'B19 /root sole writer',start:new Date().toISOString(),root,head:git('rev-parse','HEAD'),base:git('merge-base','HEAD','origin/main'),common:git('rev-parse','--git-common-dir'),status:git('status','--porcelain'),worktrees:git('worktree','list','--porcelain'),container:inspect.Id,mounts:inspect.Mounts,port,identity,db,adminUrl:u.href,protected:protectedFiles(),secrets:Array.from({length:4},()=>crypto.randomBytes(48).toString('hex'))};
    // Persist exact intent BEFORE CREATE; a later cleanup requires created readback.
    j('manifest.private',m);
    await admin.query('create database "'+db+'"');
    const created=(await admin.query('select oid,datname from pg_database where datname=$1',[db])).rows[0];
    j('database-created',{...created,container:inspect.Id,system_identifier:identity.system_identifier});
    await admin.end();
  }
  const currentContainer=JSON.parse(cp.execFileSync('docker',['inspect',m.container],{encoding:'utf8'}))[0];
  assert.ok(currentContainer.State.Running);assert.deepEqual(currentContainer.Mounts,m.mounts);
  assert.deepEqual(currentContainer.NetworkSettings.Ports['5432/tcp'][0],m.port);
  const admin=new Client({connectionString:m.adminUrl});await admin.connect();
  assert.equal((await admin.query('select system_identifier::text from pg_control_system()')).rows[0].system_identifier,m.identity.system_identifier);
  const created=JSON.parse(fs.readFileSync(path.join(dir,'database-created.json')));
  assert.equal((await admin.query('select oid from pg_database where datname=$1',[m.db])).rows[0]?.oid,created.oid);
  if(process.argv[2]==='cleanup'){
    assert.match(m.db,/^b19_[a-f0-9]{16}$/);
    assert.equal((await admin.query('select pid from pg_stat_activity where datname=$1',[m.db])).rowCount,0,'Unexpected live DB consumer; do not terminate it');
    const target=new URL(m.adminUrl);target.pathname='/'+m.db;
    const proof=new Client({connectionString:target.href});await proof.connect();
    const tables=(await proof.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
    const snapshot={};for(const {tablename} of tables){const quoted='"'+tablename.replaceAll('"','""')+'"';snapshot[tablename]=(await proof.query('select * from '+quoted)).rows}
    j('final-disposable-snapshot.private',snapshot);await proof.end();
    const evidence=fs.readdirSync(dir).filter(n=>/\.json$|\.png$|\.log$/.test(n)).map(n=>({name:n,sha256:hash(path.join(dir,n))}));
    j('retained-evidence-manifest',{files:evidence,protectedCount:m.protected.length});
    await admin.query('drop database "'+m.db+'"');
    assert.equal((await admin.query('select 1 from pg_database where datname=$1',[m.db])).rowCount,0);
    j('cleanup',{db:m.db,oid:created.oid,container:m.container,removed:true,retainedEvidence:true,protectedUnchanged:m.protected.every(x=>hash(x.path)===x.sha256)});
    await admin.end();console.log('Only verified B19 database removed; container and protected resources retained');return;
  }
  await admin.end();
  const u=new URL(m.adminUrl);u.pathname='/'+m.db;
  const env={};for(const k of ['SystemRoot','WINDIR','TEMP','TMP','PATH','Path','USERPROFILE','LOCALAPPDATA','APPDATA','COMSPEC','ComSpec','PATHEXT','ProgramFiles','PROGRAMFILES'])if(process.env[k])env[k]=process.env[k];
  const guard=path.join(dir,'guard.cjs');
  if(!fs.existsSync(guard))fs.writeFileSync(guard,fs.readFileSync(path.join(root,'.cache/b09-fresh-gate.cjs'))+`\nconst b19connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...a){let v=Array.isArray(a[0])?a[0]:a;const o=v[0];const p=typeof o==='object'?o.port:o;if([1,25,465,587].includes(Number(p)))throw Error('B19_SMTP_DENIED');return b19connect.apply(this,a)};`);
  Object.assign(env,{NODE_ENV:'test',NODE_OPTIONS:'--use-system-ca --require='+guard,DATABASE_URL:u.href,STORE_CORS:'http://127.0.0.1:19040',ADMIN_CORS:'http://127.0.0.1:19040',VENDOR_CORS:'http://127.0.0.1:19040',AUTH_CORS:'http://127.0.0.1:19040',JWT_SECRET:m.secrets[0],COOKIE_SECRET:m.secrets[1],DOGRUADRES_INVITATION_SECRET:m.secrets[2],DOGRUADRES_MFA_ENCRYPTION_KEY:m.secrets[3],DOGRUADRES_IDENTITY_ENABLED:'true',DOGRUADRES_MFA_RUNTIME_ENABLED:'true',DOGRUADRES_MFA_ENROLLMENT_ENABLED:'true',DOGRUADRES_MFA_SETTINGS_ENABLED:'true',DOGRUADRES_PUBLIC_ORIGIN:'http://127.0.0.1:19041',DOGRUADRES_PRIVATE_API:'http://127.0.0.1:19042',DOGRUADRES_FRONTDOOR_HOST:'127.0.0.1',DOGRUADRES_FRONTDOOR_PORT:'19041',B19_DIR:dir,B19_DATABASE:m.db,SMTP_HOST:'127.0.0.1',SMTP_PORT:'1',SMTP_USERNAME:'',SMTP_PASSWORD:''});
  const cli=path.join(path.dirname(req.resolve('@medusajs/cli/package.json')),'cli.js');
  const mode=process.argv[2]||'integration';
  if(mode==='browser')env.B19_FULL='true';
  if(mode==='read-only-browser')env.B19_READ_ONLY_BROWSER='true';
  const paths=[...git('diff','--name-only').split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')]
    .filter(p=>p&&(!p.includes('/integration-tests/postgres/')||p.includes('/b19-'))&&!p.includes('/evidence-'));
  j('source-attestation-'+Date.now(),{head:git('rev-parse','HEAD'),stage:mode,files:paths.map(p=>({path:p,sha256:hash(path.join(root,p))}))});
  const args=mode==='migrate'?['db:migrate','--execute-safe-links','--skip-scripts','--skip-search']:['exec','./integration-tests/postgres/b19-notifications.exec.ts'];
  if(mode==='migrate')env.DOGRUADRES_IDENTITY_ENABLED='false';
  const log=fs.openSync(path.join(dir,mode+'-'+Date.now()+'.log'),'wx');
  const child=cp.spawn(process.execPath,[cli,...args],{cwd:api,env,stdio:['ignore',log,log],windowsHide:true});
  console.log('B19 stage started:',mode,'PID',child.pid);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});fs.closeSync(log);
  const differences=m.protected.filter(x=>hash(x.path)!==x.sha256);
  j('protected-check-'+Date.now(),{count:m.protected.length,differences});assert.equal(differences.length,0);
  console.log('B19 stage finished:',mode,'exit',code,'protected unchanged',m.protected.length);process.exitCode=code;
}
main().catch(e=>{console.error('B19 runner failed:',e.message.replace(/postgres:\/\/[^ ]+/g,'[REDACTED]'));process.exitCode=1});

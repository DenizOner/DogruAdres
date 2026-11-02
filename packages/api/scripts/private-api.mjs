import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {ingressConfig} from '../src/utils/ingress-config.ts'
// Use the installed, supported CLI host/port flags. No framework hook/patch.
const config=ingressConfig(process.env),target=new URL(config.privateOrigin)
const mode=process.env.NODE_ENV==='production'?'start':'dev'
const child=spawn(process.platform==='win32'?'bun.exe':'bun',['run',mode,'--','--host',target.hostname.replace(/^\[|\]$/g,''),'--port',target.port||'80'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:process.env,stdio:'inherit'})
child.on('error',()=>{console.error('Private API launcher failed');process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
  if(child.exitCode===null&&child.pid){
    if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'})
    else child.kill(signal)
  }
})

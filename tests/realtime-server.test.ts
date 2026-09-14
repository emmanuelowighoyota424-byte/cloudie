import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { createHash } from 'node:crypto'
import { prisma } from '../lib/prisma'

const port = 10001
const origin = 'http://127.0.0.1:3000'
let child: ReturnType<typeof spawn> | null = null

function sha256(value:string){return createHash('sha256').update(value).digest('hex')}
function maskedFrame(value:string){const body=Buffer.from(value);const mask=Buffer.from([11,37,71,101]);const out=Buffer.alloc(2+4+body.length);out[0]=0x81;out[1]=0x80|body.length;mask.copy(out,2);for(let i=0;i<body.length;i++)out[6+i]=body[i]^mask[i%4];return out}
function parseFrame(buffer:Buffer){if(buffer.length<2)return null;let length=buffer[1]&0x7f;let offset=2;if(length===126){if(buffer.length<4)return null;length=buffer.readUInt16BE(2);offset=4}if(length===127)throw new Error('test frame too large');if(buffer.length<offset+length)return null;return JSON.parse(buffer.subarray(offset,offset+length).toString()) as Record<string,unknown>}
async function waitForHealth(){for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${port}/health`);if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('realtime server did not become healthy')}
async function connect(ticket:string){return await new Promise<{socket:net.Socket;wait:(predicate:(v:Record<string,unknown>)=>boolean)=>Promise<Record<string,unknown>>}>((resolve,reject)=>{const socket=net.connect(port,'127.0.0.1');let buffer=Buffer.alloc(0);const queue:Array<{predicate:(v:Record<string,unknown>)=>boolean;resolve:(v:Record<string,unknown>)=>void;reject:(e:Error)=>void}>=[];const wait=(predicate:(v:Record<string,unknown>)=>boolean)=>new Promise<Record<string,unknown>>((res,rej)=>queue.push({predicate,resolve:res,reject:rej}));socket.on('connect',()=>{const key=Buffer.from(crypto.randomUUID()).toString('base64');const url=`/ws?ticket=${encodeURIComponent(ticket)}`;socket.write(`GET ${url} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nOrigin: ${origin}\r\n\r\n`)});let upgraded=false;socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(!upgraded){const marker=buffer.indexOf('\r\n\r\n');if(marker<0)return;const headers=buffer.subarray(0,marker).toString();if(!headers.startsWith('HTTP/1.1 101')){reject(new Error(headers));socket.destroy();return}upgraded=true;buffer=buffer.subarray(marker+4)}while(true){const message=parseFrame(buffer);if(!message)break;const rawLength=2+(buffer[1]&0x7f);buffer=buffer.subarray(rawLength);for(let i=0;i<queue.length;i++){if(queue[i].predicate(message)){const item=queue.splice(i,1)[0];item.resolve(message);break}}}});socket.on('error',err=>{for(const item of queue)item.reject(err);reject(err)}) ;resolve({socket,wait})})}
async function makeTicket(userId:string,sessionId:string,workspaceId:string){const raw=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');await prisma.$executeRaw`INSERT INTO "RealtimeTicket"("id","tokenHash","sessionId","userId","workspaceId","expiresAt") VALUES (${crypto.randomUUID()},${sha256(raw)},${sessionId},${userId},${workspaceId},CURRENT_TIMESTAMP+INTERVAL '60 seconds')`;return raw}

test('persistent realtime server authenticates, scopes events and replays outbox events',async()=>{
  const userA=await prisma.user.create({data:{id:crypto.randomUUID(),name:'Realtime A',email:`realtime-a-${Date.now()}@example.test`,emailVerified:true}})
  const userB=await prisma.user.create({data:{id:crypto.randomUUID(),name:'Realtime B',email:`realtime-b-${Date.now()}@example.test`,emailVerified:true}})
  const workspace=await prisma.workspace.create({data:{name:'Realtime Test',slug:`realtime-${Date.now()}`,ownerId:userA.id,members:{create:{userId:userA.id,role:'WORKSPACE_ADMIN'}}})
  await prisma.workspaceMember.create({data:{workspaceId:workspace.id,userId:userB.id,role:'CUSTOMER'}})
  const sessionA=await prisma.session.create({data:{id:crypto.randomUUID(),token:crypto.randomUUID(),userId:userA.id,expiresAt:new Date(Date.now()+3600000)}})
  const sessionB=await prisma.session.create({data:{id:crypto.randomUUID(),token:crypto.randomUUID(),userId:userB.id,expiresAt:new Date(Date.now()+3600000)}})
  const ticketA=await makeTicket(userA.id,sessionA.id,workspace.id)
  const ticketB=await makeTicket(userB.id,sessionB.id,workspace.id)
  const notificationA=await prisma.notification.create({data:{userId:userA.id,workspaceId:workspace.id,type:'TEST',title:'Private A',message:'A only'}})
  const notificationB=await prisma.notification.create({data:{userId:userB.id,workspaceId:workspace.id,type:'TEST',title:'Private B',message:'B only'}})
  child=spawn('node',['realtime/server.mjs'],{env:{...process.env,PORT:String(port),REALTIME_ALLOWED_ORIGINS:origin},stdio:'ignore'})
  try{
    await waitForHealth()
    const a=await connect(ticketA);const b=await connect(ticketB)
    await a.wait(v=>v.type==='ready');await b.wait(v=>v.type==='ready')
    a.socket.write(maskedFrame(JSON.stringify({type:'subscribe',workspaceId:workspace.id,since:0})))
    b.socket.write(maskedFrame(JSON.stringify({type:'subscribe',workspaceId:workspace.id,since:0})))
    await a.wait(v=>v.type==='subscribed');await b.wait(v=>v.type==='subscribed')
    const eventA=await a.wait(v=>v.type==='event'&&v.entityId===notificationA.id)
    assert.equal(eventA.eventType,'NOTIFICATION_CREATED')
    const bLeak=await Promise.race([b.wait(v=>v.type==='event'&&v.entityId===notificationA.id).then(()=>true),new Promise<boolean>(r=>setTimeout(()=>r(false),500))])
    assert.equal(bLeak,false)
    const cursor=Number(eventA.id)
    a.socket.end();b.socket.end()
    const sessionA2=await prisma.session.create({data:{id:crypto.randomUUID(),token:crypto.randomUUID(),userId:userA.id,expiresAt:new Date(Date.now()+3600000)}})
    const ticketA2=await makeTicket(userA.id,sessionA2.id,workspace.id)
    const replay=await connect(ticketA2);await replay.wait(v=>v.type==='ready');replay.socket.write(maskedFrame(JSON.stringify({type:'subscribe',workspaceId:workspace.id,since:Math.max(0,cursor-1)})));const replayed=await replay.wait(v=>v.type==='event'&&v.entityId===notificationA.id);assert.equal(replayed.eventType,'NOTIFICATION_CREATED');assert.ok(Number(replayed.id)>=cursor);replay.socket.end();await prisma.session.delete({where:{id:sessionA2.id}})
    await prisma.notification.deleteMany({where:{id:{in:[notificationA.id,notificationB.id]}}})
    await prisma.session.deleteMany({where:{id:{in:[sessionA.id,sessionB.id]}}})
    await prisma.workspaceMember.deleteMany({where:{workspaceId:workspace.id}})
    await prisma.workspace.delete({where:{id:workspace.id}})
    await prisma.user.deleteMany({where:{id:{in:[userA.id,userB.id]}}})
  } finally {child?.kill('SIGTERM');child=null}
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../../lib/prisma'
import { creditPoints, debitPoints, getPointBalance } from '../../lib/points'

test('central points ledger is workspace-attributed and prevents concurrent double spend', async () => {
  const userId=crypto.randomUUID();const workspaceId=crypto.randomUUID();const email=`${userId}@example.invalid`
  await prisma.user.create({data:{id:userId,name:'Points Concurrency Test',email}})
  await prisma.workspace.create({data:{id:workspaceId,name:'Points Test',slug:`points-${userId}`,ownerId:userId}})
  await prisma.workspaceMember.create({data:{id:crypto.randomUUID(),workspaceId,userId,role:'WORKSPACE_ADMIN'}})
  await creditPoints({userId,workspace:workspaceId,amount:100,description:'Test funding',reference:`test-credit:${userId}`})
  const results=await Promise.allSettled([60,60,60,60].map((amount,i)=>debitPoints({userId,workspace:workspaceId,amount,description:'Concurrent test debit',reference:`test-debit:${userId}:${i}`})))
  const fulfilled=results.filter(r=>r.status==='fulfilled')
  assert.equal(fulfilled.length,1)
  assert.equal(await getPointBalance(userId),40)
  const rows=await prisma.$queryRaw<Array<{workspaceId:string|null}>>`SELECT "workspaceId" FROM "PointLedger" WHERE "userId"=${userId} ORDER BY "createdAt" ASC`
  assert.ok(rows.every(r=>r.workspaceId===workspaceId))
  await prisma.pointLedger.deleteMany({where:{userId:userId}})
  await prisma.workspaceMember.deleteMany({where:{workspaceId}})
  await prisma.workspace.delete({where:{id:workspaceId}})
  await prisma.user.delete({where:{id:userId}})
})

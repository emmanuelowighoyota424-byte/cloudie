import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

test('five-workspace persistence paths remain tenant-scoped', async () => {
  const userId=crypto.randomUUID(), workspaceId=crypto.randomUUID(), otherWorkspaceId=crypto.randomUUID()
  await prisma.user.create({data:{id:userId,name:'Workspace E2E',email:`${userId}@example.invalid`,emailVerified:true}})
  await prisma.workspace.create({data:{id:workspaceId,name:'Workspace E2E',slug:`workspace-e2e-${Date.now()}`,ownerId:userId}})
  await prisma.workspace.create({data:{id:otherWorkspaceId,name:'Other Workspace',slug:`other-e2e-${Date.now()}`,ownerId:userId}})
  await prisma.workspaceMember.createMany({data:[{id:crypto.randomUUID(),workspaceId,userId,role:'WORKSPACE_ADMIN'},{id:crypto.randomUUID(),workspaceId:otherWorkspaceId,userId,role:'CUSTOMER'}]})
  const ticketId=crypto.randomUUID(), idem=`workspace-e2e:${crypto.randomUUID()}`
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "TicketingDocument"("id","workspaceId","userId","type","title","payload","pointsCharged","idempotencyKey") VALUES (${ticketId},${workspaceId},${userId},'flight','Flight record',${JSON.stringify({passenger:'E2E',route:'JFK-LHR',status:'CONFIRMED'})}::jsonb,0,${idem})`)
  const own=await prisma.$queryRaw<Array<{id:string;type:string}>>(Prisma.sql`SELECT "id","type" FROM "TicketingDocument" WHERE "id"=${ticketId} AND "workspaceId"=${workspaceId} AND "userId"=${userId}`)
  const foreign=await prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "TicketingDocument" WHERE "id"=${ticketId} AND "workspaceId"=${otherWorkspaceId}`)
  assert.equal(own.length,1);assert.equal(own[0]?.type,'flight');assert.equal(foreign.length,0)
  const planId=crypto.randomUUID()
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "BusinessInvestmentPlan"("id","workspaceId","name","currency","minimumAmount","termDays","status") VALUES (${planId},${workspaceId},'E2E Plan','USD',100,30,'ACTIVE')`)
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "BusinessBillingConfig"("id","workspaceId","renewalPoints","autoRenew","status") VALUES (${crypto.randomUUID()},${workspaceId},25,TRUE,'ACTIVE')`)
  const plan=await prisma.$queryRaw<Array<{id:string;minimumAmount:string;termDays:number}>>(Prisma.sql`SELECT "id","minimumAmount"::text AS "minimumAmount","termDays" FROM "BusinessInvestmentPlan" WHERE "id"=${planId} AND "workspaceId"=${workspaceId}`)
  const billing=await prisma.$queryRaw<Array<{renewalPoints:number;autoRenew:boolean}>>(Prisma.sql`SELECT "renewalPoints","autoRenew" FROM "BusinessBillingConfig" WHERE "workspaceId"=${workspaceId}`)
  assert.equal(plan.length,1);assert.equal(Number(plan[0]?.minimumAmount),100);assert.equal(plan[0]?.termDays,30);assert.equal(billing[0]?.renewalPoints,25);assert.equal(billing[0]?.autoRenew,true)
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "BusinessBillingConfig" WHERE "workspaceId" IN (${workspaceId},${otherWorkspaceId})`)
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "BusinessInvestmentPlan" WHERE "workspaceId" IN (${workspaceId},${otherWorkspaceId})`)
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "TicketingDocument" WHERE "id"=${ticketId}`)
  await prisma.workspaceMember.deleteMany({where:{workspaceId:{in:[workspaceId,otherWorkspaceId]}}});await prisma.workspace.deleteMany({where:{id:{in:[workspaceId,otherWorkspaceId]}}});await prisma.user.delete({where:{id:userId}})
})

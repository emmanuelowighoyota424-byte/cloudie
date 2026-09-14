import { formatUnits, parseUnits } from 'viem'

export type CryptoDeposit = { id: string; asset: string; network: string; address: string | null; expectedAmount: string | null; txHash: string | null; confirmations: number; status: string }
export interface CryptoProvider {
  createDepositAddress(input:{customerId:string;asset:string;network:string}):Promise<{address:string;reference?:string}>
  getDepositStatus(input:{reference?:string;txHash?:string}):Promise<CryptoDeposit>
  verifyTransaction(input:{txHash:string;asset:string;network:string;expectedAmount?:string}):Promise<CryptoDeposit>
  normalizeWebhook(payload:unknown):{eventId:string;reference?:string;txHash?:string;status:string}|null
}

const rpc = () => { const value=process.env.CRYPTO_RPC_URL; if(!value) throw new Error('CRYPTO_RPC_URL is not configured'); return value }
const depositAddress = () => { const value=process.env.CRYPTO_DEPOSIT_ADDRESS; if(!value) throw new Error('CRYPTO_DEPOSIT_ADDRESS is not configured'); return value.toLowerCase() }
const decimals = Number(process.env.CRYPTO_ASSET_DECIMALS ?? 18)
const requiredConfirmations = Math.max(1,Number(process.env.CRYPTO_CONFIRMATIONS ?? 12))

async function rpcCall(method:string,params:unknown[]){const response=await fetch(rpc(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params}),cache:'no-store'});if(!response.ok)throw new Error(`Crypto RPC failed (${response.status})`);const body=await response.json() as {result?:unknown;error?:{message?:string}};if(body.error)throw new Error(body.error.message??'Crypto RPC error');return body.result}

export function getCryptoProvider():CryptoProvider{
  return {
    async createDepositAddress({customerId,asset,network}){if(!asset||!network)throw new Error('Asset and network are required');return{address:depositAddress(),reference:`cloudie:${customerId}:${asset}:${network}`}},
    async getDepositStatus({txHash}){if(!txHash)throw new Error('txHash is required');return this.verifyTransaction({txHash,asset:'NATIVE',network:process.env.CRYPTO_CHAIN??'EVM'})},
    async verifyTransaction({txHash,asset,network,expectedAmount}){
      if(network.toUpperCase()!==(process.env.CRYPTO_CHAIN??'EVM').toUpperCase())throw new Error('Unsupported configured crypto network')
      const tx=await rpcCall('eth_getTransactionByHash',[txHash]) as {to?:string;value?:string;blockNumber?:string}|null
      if(!tx)throw new Error('Transaction not found on configured blockchain node')
      if((tx.to??'').toLowerCase()!==depositAddress())return{ id:txHash,asset,network,address:depositAddress(),expectedAmount:expectedAmount??null,txHash,confirmations:0,status:'REJECTED' }
      const valueHex=tx.value??'0x0'
      const amount=formatUnits(BigInt(valueHex),decimals)
      if(expectedAmount){try{if(BigInt(parseUnits(amount,decimals))<BigInt(parseUnits(expectedAmount,decimals)))return{id:txHash,asset,network,address:depositAddress(),expectedAmount,txHash,confirmations:0,status:'REJECTED'}}catch{throw new Error('Invalid expected crypto amount')}}
      const latest=await rpcCall('eth_blockNumber',[]) as string
      const receipt=await rpcCall('eth_getTransactionReceipt',[txHash]) as {status?:string;blockNumber?:string}|null
      const confirmations=receipt?.blockNumber?Math.max(0,Number(BigInt(latest)-BigInt(receipt.blockNumber))+1):0
      const status=receipt?.status==='0x0'?'FAILED':confirmations>=requiredConfirmations?'CONFIRMED':'PENDING'
      return{id:txHash,asset,network,address:depositAddress(),expectedAmount:expectedAmount??amount,txHash,confirmations,status}
    },
    normalizeWebhook(payload){const value=payload as Record<string,unknown>;if(typeof value.eventId!=='string'||typeof value.txHash!=='string')return null;return{eventId:value.eventId,reference:typeof value.reference==='string'?value.reference:undefined,txHash:value.txHash,status:typeof value.status==='string'?value.status:'PENDING'}}
  }
}

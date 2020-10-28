import * as _ from "lodash";
import { Contract, providers } from 'ethers'
import { Interface } from "@ethersproject/abi"
import { request, gql } from 'graphql-request'

import { checkCallForSignatures, getSigHashes, subcallMatch } from "./utils";
import { Inspector } from "./Inspector";
import { BALANCER_EXCHANGE_PROXY_ADDRESS } from "./config/addresses";
import { ACTION_PROVIDER, ACTION_TYPE, ParitySubCallWithRevert, SpecificAction, ACTION_STATUS, TradeAction } from "./types";
import { TokenTracker } from "./TokenTracker";
import { BALANCER_BPOOL_ABI, BALANCER_EXCHANGE_PROXY_ABI } from "./config/abi";

export class InspectorBalancer extends Inspector {
  private balancerPoolAddresses: Array<string>;
  private balancerPoolInterface: Interface;
  private balancerPoolSigHashes: Array<string>;
  private balancerExchangeProxyInterface: Interface;
  private balancerExchangeProxySigHashes: Array<string>;

  constructor(provider: providers.JsonRpcProvider, poolAddresses: Array<string>) {
    super(provider);

    // Pool
    const poolTradingFunctions = ['swapExactAmountIn', 'swapExactAmountOut']
    this.balancerPoolAddresses = poolAddresses
    this.balancerPoolInterface = new Interface(BALANCER_BPOOL_ABI)
    this.balancerPoolSigHashes = getSigHashes(this.balancerPoolInterface, poolTradingFunctions);

    // Exchange proxy
    const exchangeProxyTradingFunctions = ['batchSwapExactIn', 'batchSwapExactOut', 'multihopBatchSwapExactIn', 'multihopBatchSwapExactOut', 'smartSwapExactIn', 'smartSwapExactOut']
    this.balancerExchangeProxyInterface = new Interface(BALANCER_EXCHANGE_PROXY_ABI)
    this.balancerExchangeProxySigHashes = getSigHashes(this.balancerExchangeProxyInterface, exchangeProxyTradingFunctions)
  }

  static async create(provider: providers.JsonRpcProvider): Promise<InspectorBalancer> {
    // Load all pool addresses
    const poolsResult = await request('https://api.thegraph.com/subgraphs/name/balancer-labs/balancer', BALANCER_POOLS_QUERY)
    const poolAddresses = poolsResult.pools.map((p: { id: string }) => p.id)

    return new InspectorBalancer(provider, poolAddresses)
  }

  async inspect(calls: Array<ParitySubCallWithRevert>): Promise<Array<SpecificAction>> {
    const result = new Array<SpecificAction>()

    const unknownCalls = _.clone(calls)

    // Exchange proxy trades
    const proxyTradeCalls = _.filter(unknownCalls, (call) =>
      (call.action.to === BALANCER_EXCHANGE_PROXY_ADDRESS.toLowerCase()) &&
      checkCallForSignatures(call, this.balancerExchangeProxySigHashes))

    for (const tradeCall of proxyTradeCalls) {
      const subCallsOfTrade = _.remove(unknownCalls, call => {
        return call.transactionHash === tradeCall.transactionHash &&
          subcallMatch(call, tradeCall.traceAddress)
      })

      if (subCallsOfTrade.length === 0) {
        console.warn("Removed a recursive call")
        continue
      }
      const parsedTradeCall = this.balancerExchangeProxyInterface.parseTransaction({data: tradeCall.action.input});
      // TODO: save call arguments

      const tokenTracker = new TokenTracker(subCallsOfTrade);

      const action: TradeAction = {
        provider: ACTION_PROVIDER.BALANCER,
        type: ACTION_TYPE.TRADE,
        actionCalls: subCallsOfTrade,
        transactionHash: tradeCall.transactionHash,
        subcall: tradeCall,
        status: tradeCall.reverted ? ACTION_STATUS.REVERTED : ACTION_STATUS.SUCCESS,
      };

      if (tradeCall.reverted) {
        result.push(action)
        continue
      }

      result.push(action)
    }

    // Direct pool trades
    const poolTradeCalls = _.filter(unknownCalls, (call) =>
      (this.balancerPoolAddresses.some((addr) => call.action.to === addr.toLowerCase())) &&
      checkCallForSignatures(call, this.balancerPoolSigHashes))

    for (const tradeCall of poolTradeCalls) {
      const subCallsOfTrade = _.remove(unknownCalls, call => {
        return call.transactionHash === tradeCall.transactionHash &&
          subcallMatch(call, tradeCall.traceAddress)
      })

      if (subCallsOfTrade.length === 0) {
        console.warn("Removed a recursive call")
        continue
      }
      const parsedTradeCall = this.balancerPoolInterface.parseTransaction({data: tradeCall.action.input})
      // TODO: save call arguments

      const tokenTracker = new TokenTracker(subCallsOfTrade)

      const action: TradeAction = {
        provider: ACTION_PROVIDER.BALANCER,
        type: ACTION_TYPE.TRADE,
        actionCalls: subCallsOfTrade,
        transactionHash: tradeCall.transactionHash,
        subcall: tradeCall,
        status: tradeCall.reverted ? ACTION_STATUS.REVERTED : ACTION_STATUS.SUCCESS,
      };

      if (tradeCall.reverted) {
        result.push(action)
        continue
      }

      result.push(action)
    }

    // TODO: track CHECKs

    return result
  }
}

const BALANCER_POOLS_QUERY = gql`
  {
    pools(
      first: 1000,
      where: {publicSwap: true, active:true, swapsCount_gt: 100},
      orderBy: swapsCount,
      orderDirection: desc
    ) {
      id
    }
  }
`
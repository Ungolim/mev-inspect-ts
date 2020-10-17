import * as _ from "lodash";
import { Contract, providers } from 'ethers'
import { Interface } from "@ethersproject/abi";

import { checkCallForSignatures, getSigHashes, subcallMatch } from "./utils";
import { Inspector } from "./Inspector";
import { LENDING_POOL_CORE_ADDRESS, SUSHISWAP_ROUTER_ADDRESS, UNISWAP_ROUTER_ADDRESS } from "./config/addresses";
import { ACTION_PROVIDER, ACTION_TYPE, ParitySubCallWithRevert, SpecificAction, STATUS, TradeAction } from "./types";
import { TokenTracker } from "./TokenTracker";
import { UNISWAP_PAIR_ABI, UNISWAP_ROUTER_ABI } from "./config/abi";

export class InspectorUniswap extends Inspector {
  public static sendingEthRouterFunctionNames = ["swapETHForExactTokens", "swapExactETHForTokens", "swapExactETHForTokensSupportingFeeOnTransferTokens"]
  public static receivingEthRouterFunctionNames = ["swapExactTokensForETH", "swapExactTokensForETHSupportingFeeOnTransferTokens", "swapTokensForExactETH"]

  public uniswapRouterContract: Contract
  private uniswapRouterSigHashes: Array<string>;
  private uniswapPairInterface: Interface;
  private uniswapPairSwapSigs: Array<string>;
  private uniswapPairCheckSigs: Array<string>;


  constructor(provider: providers.JsonRpcProvider) {
    super(provider);
    const tradingFunctions = _.chain(UNISWAP_ROUTER_ABI)
      .filter(abi => {
        return abi.type === "function" && abi.name !== undefined && abi.name.startsWith("swap")
      })
      .map("name")
      .compact()
      .value()
    this.uniswapRouterContract = new Contract(UNISWAP_ROUTER_ADDRESS, UNISWAP_ROUTER_ABI, provider);
    this.uniswapRouterSigHashes = getSigHashes(this.uniswapRouterContract.interface, tradingFunctions);

    this.uniswapPairInterface = new Interface(UNISWAP_PAIR_ABI)
    this.uniswapPairSwapSigs = getSigHashes(this.uniswapPairInterface, ["swap"])

    this.uniswapPairCheckSigs = getSigHashes(this.uniswapPairInterface, ["getReserves"])
  }

  static async create(provider: providers.JsonRpcProvider): Promise<InspectorUniswap> {
    return new InspectorUniswap(provider)
  }

  async inspect(calls: Array<ParitySubCallWithRevert>): Promise<Array<SpecificAction>> {
    const result = new Array<SpecificAction>()

    const unknownCalls = _.clone(calls)
    const tradeCalls = _.filter(unknownCalls, (call) =>
      (call.action.to === UNISWAP_ROUTER_ADDRESS.toLowerCase() ||
        call.action.to === SUSHISWAP_ROUTER_ADDRESS.toLowerCase()) &&
      checkCallForSignatures(call, this.uniswapRouterSigHashes))

    for (const tradeCall of tradeCalls) {
      const subCallsOfTrade = _.remove(unknownCalls, call => {
        return call.transactionHash === tradeCall.transactionHash &&
          subcallMatch(call, tradeCall.traceAddress)
      })

      if (subCallsOfTrade.length === 0) {
        // Consider a Uniswap router call-tree calling back into Uniswap Router. We cull parts of the call tree as we process it
        console.warn("Removed a recursive call")
        continue
      }
      const parsedTradeCall = this.uniswapRouterContract.interface.parseTransaction({data: tradeCall.action.input});

      const to = parsedTradeCall.args.to
      const path = parsedTradeCall.args.path
      const sourceToken = path[0].toLowerCase()
      const destToken = path[path.length - 1].toLowerCase()

      const tokenTracker = new TokenTracker(subCallsOfTrade);

      const provider = SUSHISWAP_ROUTER_ADDRESS.toLowerCase() === tradeCall.action.to ? ACTION_PROVIDER.SUSHISWAP : ACTION_PROVIDER.UNISWAP
      const action: TradeAction = {
        provider,
        type: ACTION_TYPE.TRADE,
        actionCalls: subCallsOfTrade,
        transactionHash: tradeCall.transactionHash,
        subcall: tradeCall,
        status: tradeCall.reverted ? STATUS.REVERTED : STATUS.SUCCESS,
      };

      if (tradeCall.reverted) {
        result.push(action)
        continue
      }

      // TODO - add "trade" action details. Currently only returns that a trade happened, not what was traded
      // const reserve: string = parsedTradeCall.args._reserve.toLowerCase()
      // const collateral: string = parsedTradeCall.args._collateral.toLowerCase()

      // const sendingEth = InspectorUniswap.sendingEthRouterFunctionNames.includes(parsedTradeCall.name)
      // const receivingEth = InspectorUniswap.receivingEthRouterFunctionNames.includes(parsedTradeCall.name)

      // const sourceAmount = tokenTracker.balancesByHolder[tradeCall.action.from][sendingEth ? "ETH" : sourceToken]
      // const destAmount = tokenTracker.balancesByHolder[to.toLowerCase()][receivingEth ? "ETH" : destToken]

      result.push(action)
    }

    const directPairTradeCalls = _.filter(unknownCalls, (call) => checkCallForSignatures(call, this.uniswapPairSwapSigs))
    for (const directPairTradeCall of directPairTradeCalls) {

      const subCallsOfTrade = _.remove(unknownCalls, call => {
        return call.transactionHash === directPairTradeCall.transactionHash &&
          subcallMatch(call, directPairTradeCall.traceAddress)
      })

      const action: TradeAction = {
        provider: ACTION_PROVIDER.UNISWAP, // TODO - look up
        type: ACTION_TYPE.TRADE,
        actionCalls: subCallsOfTrade,
        transactionHash: directPairTradeCall.transactionHash,
        subcall: directPairTradeCall,
        status: directPairTradeCall.reverted ? STATUS.REVERTED : STATUS.SUCCESS,
      };
      result.push(action)
    }

    // TODO: in constructor, save list of actual uniswap markets. LENDING_POOL_CORE_ADDRESS check is a hack
    // TODO: probably best to do it in a contrct which can retrieve multiple pairs per call from factory
    let directPairCheckCalls = _.filter(unknownCalls, (call) =>
      call.action.callType !== "delegatecall" &&
      call.action.to !== LENDING_POOL_CORE_ADDRESS.toLowerCase() &&
      checkCallForSignatures(call, this.uniswapPairCheckSigs))

    for (const directPairCheckCall of directPairCheckCalls) {
      const subCallsOfCheckTrade = _.remove(unknownCalls, call => {
        return call.transactionHash === directPairCheckCall.transactionHash &&
          subcallMatch(call, directPairCheckCall.traceAddress)
      })

      const action: TradeAction = {
        provider: ACTION_PROVIDER.UNISWAP, // TODO - look up
        type: ACTION_TYPE.TRADE,
        actionCalls: subCallsOfCheckTrade,
        transactionHash: directPairCheckCall.transactionHash,
        subcall: directPairCheckCall,
        status: STATUS.CHECKED,
      };
      result.push(action)
    }

    return result
  }
}

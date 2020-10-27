import * as _ from "lodash";
import { Contract, providers } from 'ethers'
import { Interface } from "@ethersproject/abi";

import { checkCallForSignatures, getSigHashes, subcallMatch } from "./utils";
import { Inspector } from "./Inspector";
import { CURVE_POOL_ADDRESSES } from "./config/addresses";
import { ACTION_PROVIDER, ACTION_TYPE, ParitySubCallWithRevert, SpecificAction, ACTION_STATUS, TradeAction } from "./types";
import { TokenTracker } from "./TokenTracker";
import { CURVE_POOL_ABI } from "./config/abi";

export class InspectorCurve extends Inspector {
  private curvePoolInterface: Interface;
  private curvePoolSigHashes: Array<string>;

  constructor(provider: providers.JsonRpcProvider) {
    super(provider);
    const tradingFunctions = _.chain(CURVE_POOL_ABI)
      .filter(abi => {
        return abi.type === "function" && abi.name !== undefined && abi.name.startsWith("exchange")
      })
      .map("name")
      .compact()
      .value()
    this.curvePoolInterface = new Interface(CURVE_POOL_ABI)
    this.curvePoolSigHashes = getSigHashes(this.curvePoolInterface, tradingFunctions);
  }

  static async create(provider: providers.JsonRpcProvider): Promise<InspectorCurve> {
    return new InspectorCurve(provider)
  }

  async inspect(calls: Array<ParitySubCallWithRevert>): Promise<Array<SpecificAction>> {
    const result = new Array<SpecificAction>()

    const unknownCalls = _.clone(calls)
    const tradeCalls = _.filter(unknownCalls, (call) =>
      (CURVE_POOL_ADDRESSES.some((addr) => call.action.to === addr.toLowerCase())) &&
      checkCallForSignatures(call, this.curvePoolSigHashes))

    for (const tradeCall of tradeCalls) {
      const subCallsOfTrade = _.remove(unknownCalls, call => {
        return call.transactionHash === tradeCall.transactionHash &&
          subcallMatch(call, tradeCall.traceAddress)
      })

      if (subCallsOfTrade.length === 0) {
        console.warn("Removed a recursive call")
        continue
      }
      const parsedTradeCall = this.curvePoolInterface.parseTransaction({data: tradeCall.action.input})

      const i = parsedTradeCall.args.i
      const j = parsedTradeCall.args.j
      const dx = parsedTradeCall.args.dx
      const min_dy = parsedTradeCall.args.min_dy

      const tokenTracker = new TokenTracker(subCallsOfTrade)

      const provider = ACTION_PROVIDER.CURVE
      const action: TradeAction = {
        provider,
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

    // TODO: do we want to track CHECKs? If so, need to figure out which calls constitute a check in Curve

    return result
  }
}

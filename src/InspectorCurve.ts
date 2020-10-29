import * as _ from "lodash";
import { Contract, providers } from 'ethers'
import { Interface } from "@ethersproject/abi";

import { checkCallForSignatures, getSigHashes, subcallMatch } from "./utils";
import { Inspector } from "./Inspector";
import { CURVE_POOL_REGISTRY_ADDRESS } from "./config/addresses";
import { ACTION_PROVIDER, ACTION_TYPE, ParitySubCallWithRevert, SpecificAction, ACTION_STATUS, TradeAction } from "./types";
import { TokenTracker } from "./TokenTracker";
import { CURVE_POOL_ABI, CURVE_POOL_REGISTRY_ABI } from "./config/abi";

export class InspectorCurve extends Inspector {
  private curvePoolAddresses: Array<string>;
  private curvePoolInterface: Interface;
  private curvePoolSigHashes: Array<string>;

  constructor(provider: providers.JsonRpcProvider, poolAddresses: Array<string>) {
    super(provider);
    const tradingFunctions = _.chain(CURVE_POOL_ABI)
      .filter(abi => {
        return abi.type === "function" && abi.name !== undefined && abi.name.startsWith("exchange")
      })
      .map("name")
      .compact()
      .value()
    this.curvePoolAddresses = poolAddresses
    this.curvePoolInterface = new Interface(CURVE_POOL_ABI)
    this.curvePoolSigHashes = getSigHashes(this.curvePoolInterface, tradingFunctions);
  }

  static async create(provider: providers.JsonRpcProvider): Promise<InspectorCurve> {
    // Load all pool addresses
    const poolRegistry = new Contract(CURVE_POOL_REGISTRY_ADDRESS, CURVE_POOL_REGISTRY_ABI, provider);
    const poolCount = (await poolRegistry.pool_count()).toNumber();
    const poolAddresses = await Promise.all([ ...Array(poolCount).keys() ].map(i => poolRegistry.pool_list(i)));

    return new InspectorCurve(provider, poolAddresses)
  }

  async inspect(calls: Array<ParitySubCallWithRevert>): Promise<Array<SpecificAction>> {
    const result = new Array<SpecificAction>()

    const unknownCalls = _.clone(calls)
    const tradeCalls = _.filter(unknownCalls, (call) =>
      (this.curvePoolAddresses.some((addr) => call.action.to === addr.toLowerCase())) &&
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

      result.push(action)
    }

    // TODO: do we want to track CHECKs? If so, need to figure out which calls constitute a check in Curve

    return result
  }
}

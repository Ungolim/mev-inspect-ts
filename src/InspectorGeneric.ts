import * as _ from "lodash";
import { providers } from 'ethers'
import { Interface } from "@ethersproject/abi";
import { checkCallForSignatures, subcallMatch } from "./utils";
import { Inspector } from "./Inspector";
import {
  ACTION_PROVIDER,
  ACTION_TYPE,
  ParitySubCallWithRevert,
  SpecificAction,
  ACTION_STATUS
} from "./types";
import {BALANCER_BPOOL_ABI} from "./config/abi"

export class InspectorGeneric extends Inspector {

  private readonly balancerInterface: Interface;
  private readonly balancerDirectSigHashes: string[];
  private checkers = [
    {
    //   filter: (call: ParitySubCallWithRevert) =>
    //     call.action.to === "0x45f783cce6b7ff23b2ab2d70e416cdb7d6055f51",
    //   provider: ACTION_PROVIDER.CURVE,
    //   type: ACTION_TYPE.TRADE
    // }, {
      filter: (call: ParitySubCallWithRevert) =>
        call.action.to === "0x61935cbdd02287b511119ddb11aeb42f1593b7ef",
      provider: ACTION_PROVIDER.ZEROX,
      type: ACTION_TYPE.TRADE
    }, {
      filter: (call: ParitySubCallWithRevert) =>
        call.action.to === "0x3e66b66fd1d0b02fda6c811da9e0547970db2f21",
      provider: ACTION_PROVIDER.BALANCER,
      type: ACTION_TYPE.TRADE
    }, {
      filter: (call: ParitySubCallWithRevert) => checkCallForSignatures(call, this.balancerDirectSigHashes),
      provider: ACTION_PROVIDER.BALANCER,
      type: ACTION_TYPE.TRADE
    },
  ]

  constructor(provider: providers.JsonRpcProvider) {
    super(provider);
    this.balancerInterface = new Interface(BALANCER_BPOOL_ABI)
    this.balancerDirectSigHashes = _.map(["swapExactAmountIn", "swapExactAmountOut"], functionName => this.balancerInterface.getSighash(this.balancerInterface.getFunction(functionName)) )
  }

  static async create(provider: providers.JsonRpcProvider): Promise<InspectorGeneric> {
    return new InspectorGeneric(provider)
  }

  async inspect(calls: Array<ParitySubCallWithRevert>): Promise<Array<SpecificAction>> {
    const result = new Array<SpecificAction>()

    const unknownCalls = _.clone(calls)

    for (const checker of this.checkers) {
      const checkerCalls = _.filter(unknownCalls, checker.filter)
      for (const checkerCall of checkerCalls) {
        const subCallsOfLiquidation = _.remove(unknownCalls, call => {
          return call.transactionHash === checkerCall.transactionHash &&
            subcallMatch(call, checkerCall.traceAddress)
        })
        result.push({
          provider: checker.provider,
          type: checker.type,
          status: checkerCall.reverted ? ACTION_STATUS.REVERTED : ACTION_STATUS.SUCCESS,
          actionCalls: subCallsOfLiquidation,
          subcall: checkerCall,
          transactionHash: checkerCall.transactionHash,
        })
      }
    }
    return result
  }
}

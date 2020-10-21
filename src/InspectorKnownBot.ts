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

export class InspectorKnownBot extends Inspector {

  static readonly KNOWN_BOTS = [
    "0x9799b475dec92bd99bbdd943013325c36157f383",
    "0xad572bba83cd36902b508e89488b0a038986a9f3",
    "0x00000000553a85582988aa8ad43fb7dda2466bc7",
    "0xa619651c323923ecd5a8e5311771d57ac7e64d87",
    "0x0000000071e801062eb0544403f66176bba42dc0",
    "0x5f3e759d09e1059e4c46d6984f07cbb36a73bdf1",
    "0x000000000000084e91743124a982076c59f10084",
    "0x00000000002bde777710c370e08fc83d61b2b8e1",
    "0x42d0ba0223700dea8bca7983cc4bf0e000dee772",
    "0xfd52a4bd2289aeccf8521f535ec194b7e21cdc96",
    "0xfe7f0897239ce9cc6645d9323e6fe428591b821c",
  ]

  constructor(provider: providers.JsonRpcProvider) {
    super(provider);
  }

  static async create(provider: providers.JsonRpcProvider): Promise<InspectorKnownBot> {
    return new InspectorKnownBot(provider)
  }

  async inspect(calls: Array<ParitySubCallWithRevert>): Promise<Array<SpecificAction>> {
    const callsOfKnownBots = _.filter(calls, call =>
      call.action.to !== undefined && InspectorKnownBot.KNOWN_BOTS.includes(call.action.to) && _.isEqual(call.traceAddress, []) )

    return _.map(callsOfKnownBots, call => { return {
          provider: ACTION_PROVIDER.KNOWN_BOT,
          type: ACTION_TYPE.KNOWN_BOT,
          status: call.reverted ? ACTION_STATUS.REVERTED : ACTION_STATUS.UNKNOWN,
          actionCalls: [], // TODO
          subcall: call,
          transactionHash: call.transactionHash,
        }})
      }
}

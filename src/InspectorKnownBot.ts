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
    "0x7ee8ab2a8d890c000acc87bf6e22e2ad383e23ce",
    "0x860bd2dba9cd475a61e6d1b45e16c365f6d78f66",
    "0x78a55b9b3bbeffb36a43d9905f654d2769dc55e8",
    "0x2204b8bd8c62c632df16af1475554d07e75769f0",
    "0xe33c8e3a0d14a81f0dd7e174830089e82f65fc85",
    "0xb958a8f59ac6145851729f73c7a6968311d8b633",
    "0x3144d9885e57e6931cf51a2cac6a70dad6b805b2",
    "0x000000000000006f6502b7f2bbac8c30a3f67e9a",
    "0x42a65ebdcce01d41a6e9f94b7367120fa78d26fe",
    "0x6780846518290724038e86c98a1e903888338875",
    "0xa21a415b78767166ee222c92bf4b47b6c2f916e0",
    "0xf9bf440b8b8423b472c646c3e51aa5e3d04a66f4",
    "0xd1c300000000b961df238700ef00600097000049",
    "0xd39169726d64d18add3dbbcb3cef12f36db0c70a",
    "0x00000000000017c75025d397b91d284bbe8fc7f2",
    "0x000000000025d4386f7fb58984cbe110aee3a4c4",
    "0x72b94a9e3473fdd9ecf3da7dd6cc6bb218ae79e3",
    "0x6cdc900324c935a2807ecc308f8ead1fcd62fe35",
    "0x435c90cdbbe09fa5a862a291b79c1623adbe16d0",

    // Old ones, for back-fill
    "0x0000000000009480cded7b47d438e73edf0f67e5",
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

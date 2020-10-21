import { BigNumber, Contract, providers } from 'ethers'
import * as _ from "lodash";
import { Interface } from "ethers/lib/utils";

import { getSigHashes, subcallMatch } from "./utils";
import { Inspector } from "./Inspector";
import { ERC20_ABI, AAVE_LENDING_POOL_ABI, AAVE_LENDING_POOL_CORE_ABI } from "./config/abi";
import { LENDING_POOL_ADDRESS, LENDING_POOL_CORE_ADDRESS } from "./config/addresses";
import {
  ACTION_PROVIDER,
  ACTION_TYPE,
  LiquidationAction, LiquidationOffer,
  ParitySubCallWithRevert,
  SpecificAction,
  ACTION_STATUS
} from "./types";

export class InspectorAave extends Inspector {
  private static readonly ETH_RESERVE_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

  private lendingPoolContract: Contract
  private static lendingPoolLiquidationFunctionName = 'liquidationCall';
  private lendingPoolLiquidationSigs: string;

  private lendingPoolCoreContract: Contract;
  private static lendingPoolCoreLiquidationCheckFunctionNames = ["getUserLastUpdate"]
  private lendingPoolCoreLiquidationCheckSigs: string[];
  private erc20Interface: Interface;

  constructor(provider: providers.JsonRpcProvider) {
    super(provider);

    this.lendingPoolContract = new Contract(LENDING_POOL_ADDRESS, AAVE_LENDING_POOL_ABI, provider);
    this.lendingPoolLiquidationSigs = this.lendingPoolContract.interface.getSighash(this.lendingPoolContract.interface.getFunction(InspectorAave.lendingPoolLiquidationFunctionName));

    this.lendingPoolCoreContract = new Contract(LENDING_POOL_CORE_ADDRESS, AAVE_LENDING_POOL_CORE_ABI, provider);
    this.lendingPoolCoreLiquidationCheckSigs = getSigHashes(this.lendingPoolCoreContract.interface, InspectorAave.lendingPoolCoreLiquidationCheckFunctionNames)

    this.erc20Interface = new Interface(ERC20_ABI);
  }

  static async create(provider: providers.JsonRpcProvider): Promise<InspectorAave> {
    return new InspectorAave(provider)
  }

  async inspect(calls: Array<ParitySubCallWithRevert>): Promise<Array<SpecificAction>> {
    const result = new Array<SpecificAction>()

    const unknownCalls = _.clone(calls)
    const liquidationCalls = _.filter(unknownCalls, (call) =>
      call.action.to === LENDING_POOL_ADDRESS.toLowerCase() && call.action.input.startsWith(this.lendingPoolLiquidationSigs))

    for (const liquidationCall of liquidationCalls) {
      const parsedLiquidationCall = this.lendingPoolContract.interface.parseTransaction({data: liquidationCall.action.input});

      const subCallsOfLiquidation = _.remove(unknownCalls, call => {
        return call.transactionHash === liquidationCall.transactionHash &&
          subcallMatch(call, liquidationCall.traceAddress)
      })

      const reserve: string = parsedLiquidationCall.args._reserve.toLowerCase()
      const collateral: string = parsedLiquidationCall.args._collateral.toLowerCase()

      const ZERO = BigNumber.from(0);
      const liquidationOffer: LiquidationOffer = {
        sourceToken: reserve,
        destAmount: ZERO,
        sourceAmount: ZERO,
        destToken: collateral,
        liquidationDetails: parsedLiquidationCall.args._user
      }

      if (liquidationCall.reverted) {
        result.push({
          provider: ACTION_PROVIDER.AAVE,
          type: ACTION_TYPE.LIQUIDATION,
          actionCalls: subCallsOfLiquidation,
          transactionHash: liquidationCall.transactionHash,
          subcall: liquidationCall,
          status: ACTION_STATUS.REVERTED,
          liquidation: liquidationOffer
        })
        continue
      }

      const reserveTransfer = this.getTransferInfoFromCalls(reserve, subCallsOfLiquidation)

      const collateralCall = _.filter(subCallsOfLiquidation, call => {
        return call.action.to === collateral && call.action.callType === "call"
      });

      const collateralTransferDecode = this.erc20Interface.parseTransaction({data: collateralCall[0].action.input});

      liquidationOffer.destAmount = collateralTransferDecode.args.value
      liquidationOffer.sourceAmount = reserveTransfer.value

      const action: LiquidationAction = {
        provider: ACTION_PROVIDER.AAVE,
        type: ACTION_TYPE.LIQUIDATION,
        actionCalls: subCallsOfLiquidation,
        transactionHash: liquidationCall.transactionHash,
        subcall: liquidationCall,
        status: ACTION_STATUS.SUCCESS,
        liquidation: liquidationOffer
      };
      result.push(action)
    }

    if (liquidationCalls.length > 0) {
      return result
    }

    // If we haven't found a liquidation call that happened, see if there was a preflight
    const liquidationPreflightCalls = _.filter(unknownCalls, (call) =>
      ((call.action.to === LENDING_POOL_ADDRESS.toLowerCase() && call.action.input.startsWith("0xbf92857c")) ||
        (call.action.to === LENDING_POOL_CORE_ADDRESS.toLowerCase() && call.action.input.startsWith("0x66d103f3")
        )))  // getUserAccountData

    for (const liquidationPreflightCall of liquidationPreflightCalls) {
      const subCallsOfLiquidationPreflight = _.remove(unknownCalls, call => {
        return call.transactionHash === liquidationPreflightCall.transactionHash &&
          subcallMatch(call, liquidationPreflightCall.traceAddress)
      })

      result.push({
        provider: ACTION_PROVIDER.AAVE,
        type: ACTION_TYPE.LIQUIDATION,
        actionCalls: subCallsOfLiquidationPreflight,
        transactionHash: liquidationPreflightCall.transactionHash,
        subcall: liquidationPreflightCall,
        status: ACTION_STATUS.CHECKED,
      })
    }
    return result
  }

  getTransferInfoFromCalls(reserveAddress: string, calls: Array<ParitySubCallWithRevert>) {
    if (reserveAddress === InspectorAave.ETH_RESERVE_ADDRESS) {
      const valueCalls = _.filter(calls, call => {
        return call.action.value != "0x0" && call.action.to === LENDING_POOL_CORE_ADDRESS.toLowerCase() && call.action.callType === "call"
      })
      if (valueCalls.length !== 1) {
        console.warn("Mismatch value call")
        throw new Error(`Unexpected reserveCalls for ${reserveAddress}`)
      }
      return {
        call: valueCalls[0],
        value: BigNumber.from(valueCalls[0].action.value)
      }
    } else {
      const reserveCalls = _.filter(calls, call => {
        return call.action.to === reserveAddress && call.action.callType === "call"
      })
      if (reserveCalls.length !== 1) {
        console.warn("Mismatch value call")
        throw new Error(`Unexpected reserveCalls for ${reserveAddress}`)
      }
      const reserveTransferDecode = this.erc20Interface.parseTransaction({data: reserveCalls[0].action.input});
      return {
        call: reserveCalls[0],
        value: reserveTransferDecode.args.value as BigNumber
      }
    }
  }
}

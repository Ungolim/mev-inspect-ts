import { BigNumber } from "@ethersproject/bignumber";
import * as _ from "lodash";
import { Contract, providers } from "ethers";

import { DexResult } from "./DEXQuery";
import { ERC20_ABI } from "./abi";
import { ParitySubCall, ParitySubCallWithRevert } from "./types";
import { Interface } from "ethers/lib/utils";

export function maxDexResult(priceQueries: Array<DexResult>): DexResult|undefined {
  return _.reduce(priceQueries, (max: DexResult|undefined, cur: DexResult) => {
      if (max === undefined || cur.amount.gt(max.amount)) {
        return cur
      }
      return max
    }, undefined
  )
}

export function minDexResult(priceQueries: Array<DexResult>): DexResult|undefined {
  return _.reduce(priceQueries, (max: DexResult|undefined, cur: DexResult) => {
      if (max === undefined ||
        (cur.amount.lt(max.amount))) {
        return cur
      }
      return max
    }, undefined
  )
}

export function bigNumberToDecimal(value: BigNumber, base = 18): number {
  const divisor = BigNumber.from(10).pow(base)
  return value.mul(100).div(divisor).toNumber() / 100
}

export async function getDecimalsByAddress(provider: providers.JsonRpcProvider, tokenAddress: string): Promise<number> {
  const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);
  const decimals = await tokenContract.functions.decimals();
  return decimals[0]
}

export function subcallMatch(call: ParitySubCall, targetCallTraceAddress: Array<number>): boolean {
  return _.isEqual(targetCallTraceAddress, call.traceAddress.slice(0, targetCallTraceAddress.length));
}

export function checkCallForSignatures(call: ParitySubCallWithRevert, signatures: Array<string>): boolean {
  if (call.action.input === undefined) {
    return false
  }
  return _.some(signatures, signature => call.action.input.startsWith(signature))
}

export function getSigHashes(contractInterface: Interface, functionNames: Array<string>): Array<string> {
  return _.map(functionNames, functionName => contractInterface.getSighash(functionName))
}

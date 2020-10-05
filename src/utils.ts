import { BigNumber } from "@ethersproject/bignumber";
import * as _ from "lodash";
import { Contract, providers } from "ethers";

import { DexResult } from "./DEXQuery";
import { ERC20_ABI } from "./abi";
import { ParitySubCall } from "./types";

export const GWEI = BigNumber.from(10).pow(9);
export const ETHER = BigNumber.from(10).pow(18);

export function maxBigNumber(priceQueries: Array<BigNumber>) {
  return _.reduce(priceQueries, (max: BigNumber, price: BigNumber) => {
    if (price.gt(max)) {
      return price
    }
    return max
  }, BigNumber.from(0))
}

export function maxDexResult(priceQueries: Array<DexResult>) {
  return _.reduce(priceQueries, (max: DexResult, cur: DexResult) => {
      if (cur.amount.gt(max.amount)) {
        return cur
      }
      return max
    }, {
      dex: "",
      details: "",
      amount: BigNumber.from(0)
    }
  )
}

export function minDexResult(priceQueries: Array<DexResult>) {
  return _.reduce(priceQueries, (max: DexResult, cur: DexResult) => {
      if (max.amount.eq(0) ||
        (cur.amount.lt(max.amount))) {
        return cur
      }
      return max
    }, {
      dex: "",
      details: "",
      amount: BigNumber.from(0)
    }
  )
}

export function bigNumberToDecimal(value: BigNumber, base: number = 18) {
  const divisor = BigNumber.from(10).pow(base)
  return value.mul(100).div(divisor).toNumber() / 100
}

export async function getDecimalsByAddress(provider: providers.JsonRpcProvider, tokenAddress: string): Promise<number> {
  const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);
  const decimals = await tokenContract.functions.decimals();
  return decimals[0]
}

export function subcallMatch(call: ParitySubCall, liquidationCall: ParitySubCall) {
  return _.isEqual(liquidationCall.traceAddress, call.traceAddress.slice(0, liquidationCall.traceAddress.length));
}

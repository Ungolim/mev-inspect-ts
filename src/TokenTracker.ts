import * as _ from "lodash";
import { Interface} from "ethers/lib/utils";
import { BigNumber } from "@ethersproject/bignumber";
import { printTable } from 'console-table-printer';

import { BlockData } from "./BlockData";
import { DEXQuery} from "./DEXQuery";
import { ERC20_ABI } from "./abi";
import { WETH } from "./addresses";
import { ParitySubCallWithRevert } from "./types";
import { checkCallForSignatures } from "./utils";

export interface TransferSimplified {
  from: string;
  to: string;
  token: string;
  value: BigNumber;
}
interface BalancesByToken {
  [tokenAddress: string]: BigNumber
}

export interface BalancesByHolderToken {
  [holderAddress: string]: BalancesByToken
}

const FUNCTION_SIG_TRANSFER_FROM = '0x23b872dd';
const FUNCTION_SIG_TRANSFER = '0xa9059cbb';
const FUNCTION_SIG_MINT = "0x40c10f19";
const FUNCTION_SIG_BURN_FROM = "0x79cc6790";
const FUNCTION_SIG_DEPOSIT = "0xd0e30db0";
const FUNCTION_SIG_WITHDRAW = "0x2e1a7d4d";

const erc20Interface = new Interface(ERC20_ABI);

export class TokenTracker {
  public static TOKEN_MOVEMENT_SIGNATURES = [
    FUNCTION_SIG_TRANSFER_FROM,
    FUNCTION_SIG_TRANSFER,
    FUNCTION_SIG_MINT,
    FUNCTION_SIG_BURN_FROM,
    FUNCTION_SIG_DEPOSIT,
    FUNCTION_SIG_WITHDRAW
  ]

  get transferSubCalls(): TransferSimplified[] {
    return this._transferSubCalls;
  }

  get balancesByHolder(): BalancesByHolderToken {
    return this._balancesByHolder;
  }

  private _transferSubCalls: TransferSimplified[];
  private _balancesByHolder: BalancesByHolderToken;

  constructor(calls: Array<ParitySubCallWithRevert>) {
    this._transferSubCalls = TokenTracker.extractTransfersFromSubcalls(calls)
    this._balancesByHolder = TokenTracker.getBalancesByHolder(this._transferSubCalls);
  }

  static createFromBlockData(transactionHash: string, traceAddress: Array<number>, blockData: BlockData): TokenTracker {
    return new TokenTracker(_.filter(blockData.calls, call => call.transactionHash === transactionHash))
  }

  private static extractTransfersFromSubcalls(calls: Array<ParitySubCallWithRevert>) {
    return _.chain(calls)
      .filter(call =>
        !call.reverted && call.type === 'call' &&
        (
          call.action.value !== "0x0" || checkCallForSignatures(call, TokenTracker.TOKEN_MOVEMENT_SIGNATURES)
        )
      )
      .map(transferCall => {
        const transfers = new Array<TransferSimplified>()
        const value = BigNumber.from(transferCall.action.value);
        if (value.gt(0)) {
          transfers.push({
            token: "ETH",
            from: transferCall.action.from,
            to: transferCall.action.to || "0x0",
            value,
          })
        }
        try {
          const transactionDescription = erc20Interface.parseTransaction({data: transferCall.action.input});
          if (transactionDescription !== undefined) {
            if (transferCall.action.to === WETH.toLowerCase() && transactionDescription.name === "deposit") {
              transfers.push({
                token: WETH.toLowerCase(),
                to: transferCall.action.from,
                from: WETH.toLowerCase(),
                value
              })
            } else if (transferCall.action.to === WETH.toLowerCase() && transactionDescription.name === "withdraw") {
              transfers.push({
                token: WETH.toLowerCase(),
                to: WETH.toLowerCase(),
                from: transferCall.action.from,
                value: transactionDescription.args.value
              })
            } else {
              const from = transactionDescription.name === "mint" ? "0x0" :
                transactionDescription.name === "transfer" ? transferCall.action.from :
                  transactionDescription.args.from

              const to = transactionDescription.name === "burnFrom" ? "0x0" : transactionDescription.args.to
              transfers.push({
                token: transferCall.action.to || "0x0",
                value: transactionDescription.args.value,
                to: to.toLowerCase(),
                from: from.toLowerCase()
              })
            }
          }
        } catch (e) {
          if (e.code !== "INVALID_ARGUMENT") throw e
        }

        return transfers
      })
      .flatMap()
      .value();
  }

  print(): void {
    if (_.size(this._balancesByHolder) === 0) {
      console.log("Empty")
    } else {
      TokenTracker.printBalancesByHolder(this._balancesByHolder);
    }
  }

  public static printBalancesByHolder(tokenBalancesByHolder: BalancesByHolderToken): void {
    const table = []
    for (const holderAddress in tokenBalancesByHolder) {
      table.push({})
      for (const tokenAddress in tokenBalancesByHolder[holderAddress]) {
        table.push({
          holderAddress,
          tokenAddress,
          balance: tokenBalancesByHolder[holderAddress][tokenAddress]
        })
      }
    }
    printTable(table.slice(1))
  }

  public static getBalancesByHolder(tokenTransferLogs: TransferSimplified[]): BalancesByHolderToken {
    const tokenBalancesByHolder: BalancesByHolderToken = {}
    for (const tokenTransfer of tokenTransferLogs) {

      if (tokenBalancesByHolder[tokenTransfer.from] === undefined) tokenBalancesByHolder[tokenTransfer.from] = {}
      if (tokenBalancesByHolder[tokenTransfer.to] === undefined) tokenBalancesByHolder[tokenTransfer.to] = {}
      const token = tokenTransfer.token;

      tokenBalancesByHolder[tokenTransfer.from][token] = (tokenBalancesByHolder[tokenTransfer.from][token] || BigNumber.from(0)).sub(tokenTransfer.value)
      tokenBalancesByHolder[tokenTransfer.to][token] = (tokenBalancesByHolder[tokenTransfer.to][token] || BigNumber.from(0)).add(tokenTransfer.value)
    }
    return tokenBalancesByHolder;
  }

  async getProfitsInToken(dexQuery: DEXQuery, destinationToken: string): Promise<BalancesByToken> {
    const response: { [holder: string]: BigNumber } = {}
    await Promise.all(_.map(this.balancesByHolder, async (a, holderAddress) => {
      let total = BigNumber.from(0)
      await Promise.all(_.map(a, async (tokenAmount, tokenAddress) => {
          if (tokenAmount.isNegative()) {
            const dexResult = await dexQuery.getBestPrice(destinationToken, tokenAddress, tokenAmount.abs(), false);
            if (dexResult !== undefined) {
              total = total.sub(dexResult.amount)
            }
          } else {
            const dexResult = await dexQuery.getBestPrice(tokenAddress, destinationToken, tokenAmount);
            if (dexResult !== undefined) {
              total = total.add(dexResult.amount)
            }
          }
        })
      )
      response[holderAddress] = total
    }))
    return response
  }
}

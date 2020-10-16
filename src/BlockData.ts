import { BigNumber, providers } from "ethers";
import { BlockWithTransactions } from "@ethersproject/abstract-provider";

import * as _ from "lodash";
import fs from "fs";
import { ParitySubCall, ParitySubCallWithRevert } from "./types";
import path from "path";
import { subcallMatch } from "./utils";

export class BlockData {
  public calls: Array<ParitySubCallWithRevert>;
  public block: BlockWithTransactions;
  public logs: Array<providers.Log>;
  public transactionHashes: Array<string>;
  public transactionByHash: {
    [hash: string]: providers.TransactionResponse
  };
  public receiptByHash: {
    [hash: string]: providers.TransactionReceipt
  };

  static getCacheDir(): string {
    const cacheDir = process.env.CACHE_DIR || path.normalize(`${__dirname}/../cache`)
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, 0o755);
    }
    return cacheDir
  }

  private static revertErrorMessages = [
    "Reverted",
    "Bad instruction",
    "Out of gas",
    "Bad jump destination"
  ]

  static decorateRevert(txTraces: Array<ParitySubCall>): Array<ParitySubCallWithRevert> {
    const revertTraceAddressScope = _.chain(txTraces)
      .filter(paritySubCall =>
        _.some(BlockData.revertErrorMessages, errorMessage => errorMessage === paritySubCall.error)
      )
      .groupBy('transactionHash')
      .mapValues(revertedTraces => _.map(revertedTraces, 'traceAddress'))
      .value()

    function isSubCallWithinRevertScope(paritySubCall: ParitySubCall) {
      const revertedTraceAddresses = revertTraceAddressScope[paritySubCall.transactionHash];
      if (revertedTraceAddresses === undefined) {
        return false
      }
      const traceAddress = paritySubCall.traceAddress;
      return _.some(revertedTraceAddresses, revertedTraceAddress =>
        _.isEqual(revertedTraceAddress, traceAddress.slice(0, revertedTraceAddress.length))
      )
    }

    return _.map(txTraces, txTrace => {
      return {
        ...txTrace,
        reverted: isSubCallWithinRevertScope(txTrace)
      }
    })
  }

  constructor(block: BlockWithTransactions, rawSubCalls: Array<ParitySubCall>, logs: Array<providers.Log>, receipts: Array<providers.TransactionReceipt>) {
    this.block = block
    this.calls = BlockData.decorateRevert(rawSubCalls)
    this.transactionHashes = _.chain(rawSubCalls)
      .filter(subcall => subcall.type !== "reward")
      .map("transactionHash")
      .uniq()
      .value()
    this.logs = logs

    this.transactionByHash = _.keyBy(block.transactions, "hash")
    this.receiptByHash = _.keyBy(receipts, "transactionHash")
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private static jsonBigNumberReviver(key: any, value: any)
  {
    if(typeof value == "string" && value.startsWith("bn:"))
    {
      return BigNumber.from(value.replace("bn:", ""));
    }
    return value;  // < here is where un-modified key/value pass though
  }

  private static jsonBigNumberReplacer(key: any, value: any) {
    if (value && value.constructor === Object && value.type === "BigNumber") {
      return "bn:" + value.hex;
    } else {
      return value;
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  static async createFromBlockNumber(provider: providers.JsonRpcProvider, blockNumberOrTag: providers.BlockTag, forceRefresh = false): Promise<BlockData> {
    const cacheDir = BlockData.getCacheDir()
    const cacheFile = `${cacheDir}/${blockNumberOrTag}.json`;

    if (
      !_.isNumber(blockNumberOrTag) ||
      (!forceRefresh && fs.existsSync(cacheFile))
    ) {
      const {
        block,
        receipts,
        calls,
        logs
      } = JSON.parse(fs.readFileSync(cacheFile).toString(), BlockData.jsonBigNumberReviver)
      return new BlockData(block, calls, logs, receipts)
    }

    const block = await provider.getBlockWithTransactions(blockNumberOrTag)

    const blockRpcArgument = [`0x${block.number.toString(16)}`];
    // Node needs tracing enabled
    const calls = await provider.send("trace_block", blockRpcArgument);

    const logs: providers.Log[] = await provider.getLogs({
      blockHash: block.hash
    })

    // Node needs parity RPC module enabled
    const receiptsRaw: Array<providers.TransactionReceipt> = await provider.send("parity_getBlockReceipts", blockRpcArgument)

    const receipts = _.map(receiptsRaw, BlockData.convertReceipt)

    fs.writeFileSync(cacheFile, JSON.stringify({
      block,
      receipts,
      calls,
      logs,
    }, BlockData.jsonBigNumberReplacer, 2))
    return new BlockData(block, calls, logs, receipts)
  }

  // parity_getBlockReceipts is way more efficient, but doesn't properly return gasUsed as a BigNumber
  // eslint-disable-next-line
  static convertReceipt(rawReceipt: any): providers.TransactionReceipt {
    return {
      ...rawReceipt,
      gasUsed: BigNumber.from(rawReceipt.gasUsed)
    }
  }

  getFilteredCalls(transactionHash: string | undefined = undefined, traceAddress: Array<number> | undefined = undefined): Array<ParitySubCallWithRevert> {
    let result = _.clone(this.calls)
    if (transactionHash !== undefined) {
      result = _.filter(result, (call) => call.transactionHash === transactionHash)
    }
    if (traceAddress !== undefined && !_.isEqual(traceAddress, [])) {
      result = _.filter(result, (call) => subcallMatch(call, traceAddress))
    }
    return result
  }
}

import { providers } from "ethers";
import * as _ from "lodash";
import fs from "fs";
import { ParitySubCall, ParitySubCallWithRevert } from "./types";
import path from "path";

export class BlockData {
  public calls: Array<ParitySubCallWithRevert>;
  public block: providers.Block;
  public logs: Array<providers.Log>;

  static getCacheDir() {
    // path.normalize(`${__dirname}/..`)
    const cacheDir = process.env.CACHE_DIR || path.normalize(`${__dirname}/../cache`)
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, 0o755);
    }
    return cacheDir
  }

  static decorateRevert(txTraces: Array<ParitySubCall>): Array<ParitySubCallWithRevert> {
    const revertTraceAddressScope = _.chain(txTraces)
      .filter(paritySubCall =>
        paritySubCall.error === "Reverted"
      )
      .groupBy('transactionHash')
      .mapValues(revertedTraces => _.map(revertedTraces, 'traceAddress'))
      .value()

    // console.log(revertTraceAddressScope)

    function isSubCallWithinRevertScope(paritySubCall: ParitySubCall) {
      let revertedTraceAddresses = revertTraceAddressScope[paritySubCall.transactionHash];
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

  constructor(block: providers.Block, rawSubCalls: Array<ParitySubCall>, logs: Array<providers.Log>) {
    this.block = block
    this.calls = BlockData.decorateRevert(rawSubCalls)
    this.logs = logs
  }

  static async createFromBlockNumber(provider: providers.JsonRpcProvider, blockNumberOrTag: providers.BlockTag, forceRefresh = false) {
    const block = await provider.getBlock(blockNumberOrTag);

    const cacheDir = BlockData.getCacheDir()
    const txTraceFile = `${cacheDir}/${block.number}.json`;
    const logsFile = `${cacheDir}/${block.number}.logs`;

    let txTraces: Array<ParitySubCall>;
    if (fs.existsSync(txTraceFile)) {
      txTraces = JSON.parse(fs.readFileSync(txTraceFile).toString())
    } else {
      console.log("downloading traces: " + txTraceFile)
      txTraces = await provider.send("trace_block", [`0x${block.number.toString(16)}`]);
      fs.writeFileSync(txTraceFile, JSON.stringify(txTraces, null, 2))
    }

    let logs: providers.Log[]
    if (fs.existsSync(logsFile)) {
      logs = JSON.parse(fs.readFileSync(logsFile).toString())
    } else {
      console.log("downloading logs: " + logsFile)
      logs = await provider.getLogs({
        blockHash: block.hash
      })
      fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2))
    }
    return new BlockData(block, txTraces, logs)
  }
}

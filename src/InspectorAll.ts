import * as _ from "lodash";

import { BlockData } from "./BlockData";
import { TokenTracker } from "./TokenTracker";
import { Inspector } from "./Inspector";
import { LiquidationTransactions } from "./types";

export class InspectorAll extends Inspector {
  // Simple limit for transaction count, since it can take a long time to request transactions and receipts
  static TEST_LIMIT = 8;

  async inspect(blockData: BlockData): Promise<Array<LiquidationTransactions>> {
    const result = new Array<LiquidationTransactions>()

    const allTransactionHashes = _.chain(blockData.logs)
      .map("transactionHash")
      .uniq()
      .value()

    for (const liquidateTransactionHash of allTransactionHashes) {
      const transaction = await this.provider.getTransaction(liquidateTransactionHash)
      const transactionReceipt = await this.provider.getTransactionReceipt(liquidateTransactionHash)

      const transactionCalls = _.filter(blockData.calls, (call) =>
        call.transactionHash === liquidateTransactionHash)

      const tokenTrackerAll = TokenTracker.createFromBlockData(liquidateTransactionHash, [], blockData)

      result.push(
        {
          transaction: transaction,
          transactionReceipt: transactionReceipt,
          tokenTracker: tokenTrackerAll,
          liquidations: [],
          transactionCalls,
        }
      )
      if (InspectorAll.TEST_LIMIT !== null && result.length > InspectorAll.TEST_LIMIT) break;
    }
    return result
  }
}

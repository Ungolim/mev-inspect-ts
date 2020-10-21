import { Consumer } from "./Consumer";
import { BlockData } from "./BlockData";
import * as _ from "lodash";
import { ACTION_PROVIDER, TransactionEvaluation, TRANSACTION_TYPE, TRANSACTION_STATUS } from "./types";
import { bigNumberToDecimal } from "./utils";
import { printTable } from "console-table-printer";

export class ConsumerAsciiReport extends Consumer {
  async consume(blockData: BlockData, transactionEvaluations: Array<TransactionEvaluation>): Promise<void> {
    const rows = _.map(transactionEvaluations, transactionEvaluation => {
      const compactedProviders = _.chain(transactionEvaluation.specificActions)
        .countBy(specificAction => ACTION_PROVIDER[specificAction.provider])
        .map((count, actionProvider) => actionProvider + (count > 1 ? `(${count})` : ""))
        .join(",")
        .value()

      return {
        transactionHash: transactionEvaluation.transactionHash,
        gasPrice: bigNumberToDecimal(transactionEvaluation.transaction.gasPrice, 9),
        gasUsed: transactionEvaluation.transactionReceipt.gasUsed.div(1000).toString(),
        calls: transactionEvaluation.calls.length,
        unknownCalls: transactionEvaluation.unknownCalls.length,
        classifiedCalls: transactionEvaluation.calls.length - transactionEvaluation.unknownCalls.length,
        classifiedActions: transactionEvaluation.specificActions.length,
        compactedProviders,
        type: transactionEvaluation.inferredType.type === TRANSACTION_TYPE.UNKNOWN ? "" : TRANSACTION_TYPE[transactionEvaluation.inferredType.type],
        status: transactionEvaluation.inferredType.status === TRANSACTION_STATUS.UNKNOWN ? "" : TRANSACTION_STATUS[transactionEvaluation.inferredType.status]
      }
    })
    console.log(`Block Number ${blockData.block.number}`)
    printTable(rows)
  }
}

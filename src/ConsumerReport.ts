import { Consumer } from "./Consumer";
import { BlockData } from "./BlockData";
import * as _ from "lodash";
import { ACTION_PROVIDER, TransactionEvaluation, TRANSACTION_TYPE } from "./types";
import { bigNumberToDecimal } from "./utils";
import { printTable } from "console-table-printer";

export class ConsumerAsciiReport extends Consumer {
  async consume(blockData: BlockData, transactionEvaluations: Array<TransactionEvaluation>): Promise<void> {
    const rows = _.map(transactionEvaluations, transactionEvaluation => {
      const actionList = _.map(transactionEvaluation.specificActions, specificAction => {
        return ACTION_PROVIDER[specificAction.provider]
      })
      return {
        transactionHash: transactionEvaluation.transactionHash,
        gasPrice: bigNumberToDecimal(transactionEvaluation.transaction.gasPrice, 9),
        gasUsed: transactionEvaluation.transactionReceipt.gasUsed.div(1000).toString(),
        calls: transactionEvaluation.calls.length,
        unknownCalls: transactionEvaluation.unknownCalls.length,
        classifiedCalls: transactionEvaluation.calls.length - transactionEvaluation.unknownCalls.length,
        classifiedActions: transactionEvaluation.specificActions.length,
        actionList,
        type: TRANSACTION_TYPE[transactionEvaluation.inferredType.type],
        success: transactionEvaluation.inferredType.success
      }
    })
    printTable(rows)
  }
}

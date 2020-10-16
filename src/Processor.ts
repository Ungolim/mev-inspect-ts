import * as _ from "lodash";

import { Inspector } from "./Inspector";
import { Consumer } from "./Consumer";
import { BlockData } from "./BlockData";
import { SpecificAction, TransactionEvaluation } from "./types";
import { subcallMatch } from "./utils";
import { InferTransactionType } from "./InferTransactionType";

export class Processor {
  private readonly inspectors: Array<Inspector>;
  private readonly consumers: Array<Consumer>;

  constructor(inspectors: Array<Inspector>, consumers: Array<Consumer>) {
    this.inspectors = inspectors;
    this.consumers = consumers;
  }

  async process(blockData: BlockData): Promise<void> {
    const transactionEvaluations: Array<TransactionEvaluation> = await this.getTransactionEvaluations(blockData)
    await Promise.all(_.map(this.consumers, consumer => consumer.consume(blockData, transactionEvaluations)))
  }

  private async getTransactionEvaluations(blockData: BlockData): Promise<Array<TransactionEvaluation>> {
    return await Promise.all(_.map(blockData.transactionHashes, async (transactionHash) => {
      const calls = blockData.getFilteredCalls(transactionHash)
      const specificActions = new Array<SpecificAction>()
      const unknownCalls = _.clone(calls)
      for (const inspector of this.inspectors) {
        const actions = await inspector.inspect(unknownCalls);
        _.remove(unknownCalls, call => {
          return _.some(actions, action => subcallMatch(call, action.subcall.traceAddress))
        })
        specificActions.push(...actions)
      }

      const inferTransactionType = new InferTransactionType();
      return {
        transactionHash,
        transaction: blockData.transactionByHash[transactionHash],
        transactionReceipt: blockData.receiptByHash[transactionHash],
        specificActions,
        calls,
        unknownCalls,
        inferredType: inferTransactionType.infer(specificActions, calls)
      }
    }));
  }
}

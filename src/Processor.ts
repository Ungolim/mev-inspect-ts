import * as _ from "lodash";

import { Inspector } from "./Inspector";
import { Consumer } from "./Consumer";
import { BlockData } from "./BlockData";
import { ACTION_TYPE, SpecificAction, TransactionEvaluation } from "./types";
import { bigNumberToDecimal, subcallMatch } from "./utils";
import { InferTransactionType } from "./InferTransactionType";
import { TokenTracker } from "./TokenTracker";
import { DEXQuery } from "./DEXQuery";
import { BigNumber, providers } from 'ethers'
import { WETH } from "./config/addresses";


export class Processor {
  private readonly inspectors: Array<Inspector>;
  private readonly provider: providers.JsonRpcProvider;
  private readonly consumers: Array<Consumer>;
  private readonly inferTransactionType: InferTransactionType;

  constructor(provider: providers.JsonRpcProvider , inspectors: Array<Inspector>, consumers: Array<Consumer>) {
    this.provider = provider;
    this.inspectors = inspectors;
    this.consumers = consumers;
    this.inferTransactionType = new InferTransactionType();
  }

  async process(blockData: BlockData): Promise<void> {
    const transactionEvaluations: Array<TransactionEvaluation> = await this.getTransactionEvaluations(blockData)
    await Promise.all(_.map(this.consumers, consumer => consumer.consume(blockData, transactionEvaluations)))
  }

  private async getTransactionEvaluations(blockData: BlockData): Promise<Array<TransactionEvaluation>> {
    const dexQuery = new DEXQuery(this.provider, blockData)

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

      let profit = BigNumber.from(0)
      if (_.some(specificActions, specificAction => specificAction.type === ACTION_TYPE.KNOWN_BOT)) {
        const topCall = _.find(calls, call => _.isEqual(call.traceAddress, []))
        const tokenTracker = new TokenTracker(calls)
        profit = await tokenTracker.getFilteredProfitInToken(dexQuery, WETH, [topCall!.action.to || "", topCall!.action.from]);
        console.log(transactionHash, bigNumberToDecimal(profit))
        console.log(tokenTracker.print())
      }


      return {
        transactionHash,
        transaction: blockData.transactionByHash[transactionHash],
        transactionReceipt: blockData.receiptByHash[transactionHash],
        specificActions,
        calls,
        unknownCalls,
        inferredType: this.inferTransactionType.infer(specificActions, calls),
        profit
      }
    }));
  }
}

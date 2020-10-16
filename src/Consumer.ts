import { BlockData } from "./BlockData";
import { TransactionEvaluation } from "./types";

export abstract class Consumer {
  abstract async consume(blockData: BlockData, transactionEvaluations: Array<TransactionEvaluation>): Promise<void>
}

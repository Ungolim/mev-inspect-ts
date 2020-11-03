import { printTable } from "console-table-printer";
import { BlockData } from "./BlockData";
import { TransactionEvaluation } from "./types";
import { ConsumerReport } from "./ConsumerReport";

export class ConsumerReportAsciiTable extends ConsumerReport {
  async consume(blockData: BlockData, transactionEvaluations: Array<TransactionEvaluation>) {
    console.log(`Block Number ${blockData.block.number}`)
    printTable(await this._consume(blockData, transactionEvaluations));
  }
}

import {createObjectCsvStringifier} from 'csv-writer'
import { CsvStringifier } from "csv-writer/src/lib/csv-stringifiers/abstract";

import { BlockData } from "./BlockData";
import { TransactionEvaluation } from "./types";
import { ConsumerReport } from "./ConsumerReport";

export class ConsumerCsvReport extends ConsumerReport {
  csvWriter: CsvStringifier<any>;
  constructor() {
    super();
    this.csvWriter = createObjectCsvStringifier({
      header: [
        {id: 'transactionHash', title: 'hash'},
        {id: 'gasPrice', title: 'gasPrice'},
        {id: 'gasUsed', title: 'gasUsed'},
        {id: 'calls', title: 'calls'},
        {id: 'unknownCalls', title: 'unknownCalls'},
        {id: 'classifiedCalls', title: 'classifiedCalls'},
        {id: 'classifiedActions', title: 'classifiedActions'},
        {id: 'compactedProviders', title: 'compactedProviders'},
        {id: 'type', title: 'type'},
        {id: 'status', title: 'status'},
        {id: 'profit', title: 'profit'},
      ]
    });
  }
  async consume(blockData: BlockData, transactionEvaluations: Array<TransactionEvaluation>) {
    console.log(`Block Number ${blockData.block.number}`)
    console.log(this.csvWriter.getHeaderString())
    console.log(this.csvWriter.stringifyRecords(await this._consume(blockData, transactionEvaluations)))
  }
}


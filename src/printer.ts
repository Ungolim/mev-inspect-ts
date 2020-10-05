import * as _ from "lodash";
import { printTable } from "console-table-printer";
import { providers } from "ethers";

import { bigNumberToDecimal, getDecimalsByAddress } from "./utils";
import { ArbitrageProposal, LiquidationTransactions } from "./types";

export function printTransactionInfo(transaction: LiquidationTransactions) {
  const totalFee = transaction.transactionReceipt.gasUsed.mul(transaction.transaction.gasPrice);
  const keys: Array<keyof providers.TransactionResponse> = ["hash", "from", "to", "gasPrice"];
  const txInfoRows: any = keys.map(key => {
    return {
      key,
      value: transaction.transaction[key]
    }
  })
  txInfoRows.push({
    key: "gasUsed",
    value: transaction.transactionReceipt.gasUsed,
  })
  txInfoRows.push({
    key: "totalFee",
    value: `${bigNumberToDecimal(totalFee)} (${totalFee})`,
  })
  const suicides = _.chain(transaction.transactionCalls)
    .filter(subcall => subcall.type === 'suicide')
    .size()
    .value()
  if (suicides > 0) {
    txInfoRows.push({
      key: 'suicides',
      value: `${suicides}`,
    })
  }
  printTable(txInfoRows)
}

export function printProfits(profits: any) {
  const rows = _.map(profits, (profit, holderAddress) => {
    return {
      holderAddress,
      value: bigNumberToDecimal(profit)
    }
  });

  if (rows.length > 0) {
    printTable(rows)
  }
}

export async function printArbitrageProposals(provider: providers.JsonRpcProvider, arbitrageProposals: Array<ArbitrageProposal>) {
  printTable(await Promise.all(_.map(arbitrageProposals, async (arbitrageProposal) => {
    const decimals = await getDecimalsByAddress(provider, arbitrageProposal.token);
    return {
      ...arbitrageProposal,
      profitInEth: bigNumberToDecimal(arbitrageProposal.profitInEth),
      profit: bigNumberToDecimal(arbitrageProposal.profit, decimals),
      input: bigNumberToDecimal(arbitrageProposal.input, decimals),
      output: bigNumberToDecimal(arbitrageProposal.output, decimals),
    }
  })))
}

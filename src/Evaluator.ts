import { DEXQuery } from "./DEXQuery";
import { printArbitrageProposals, printProfits, printTransactionInfo } from "./printer";
import { WETH } from "./addresses";
import { ArbitrageProposal, LiquidationTransactions } from "./types";
import { providers } from "ethers";
import { BlockData } from "./BlockData";

export class Evaluator {
  private readonly provider: providers.JsonRpcProvider;
  constructor(provider: providers.JsonRpcProvider) {
    this.provider = provider;
  }

  public async evaluate(blockData: BlockData, transactions: Array<LiquidationTransactions>) {
    const dexQuery = new DEXQuery(this.provider, blockData)

    for (const transaction of transactions) {
      console.log("\n\n\n")
      printTransactionInfo(transaction);
      transaction.tokenTracker.print()
      const profits = await transaction.tokenTracker.getProfitsInToken(dexQuery, WETH);
      printProfits(profits);

      for (const liquidation of transaction.liquidations) {
        const offer = liquidation.offer;
        console.log(offer.source + " " + offer.liquidationDetails)
        liquidation.tokenTracker.print()
        const liquidationProfits = await liquidation.tokenTracker.getProfitsInToken(dexQuery, WETH);
        printProfits(liquidationProfits);

        const bestOutput = await dexQuery.getBestPrice(offer.destToken, offer.sourceToken, offer.destAmount);
        if (bestOutput === undefined) {
          console.log("Could not get price for arb")
          continue
        }
        const profit = bestOutput.amount.sub(offer.sourceAmount);
        const profitInEth = await dexQuery.getBestPrice(offer.sourceToken, WETH, profit)
        if (profitInEth === undefined) {
          console.log("Could not get price for arb")
          continue
        }

        const arbitrageProposals = new Array<ArbitrageProposal>()
        const arbitrageProposal: ArbitrageProposal = {
          source: offer.source,
          liquidationDetails: offer.liquidationDetails,
          dex: bestOutput.dex,
          dexPath: bestOutput.details,
          token: offer.sourceToken,
          profit: profit,
          profitInEth: profitInEth.amount,
          input: offer.sourceAmount,
          output: bestOutput.amount
        };
        arbitrageProposals.push(arbitrageProposal)
        await printArbitrageProposals(this.provider, arbitrageProposals);
      }
    }
  }
}

import * as _ from "lodash";
import { DEXQuery } from "./DEXQuery";
import { ArbitrageProposal, LiquidationOffer, TransactionEvaluation } from "./types";
import { providers } from "ethers";
import { BlockData } from "./BlockData";
import { WETH } from "./config/addresses";

export class Evaluator {
  private readonly provider: providers.JsonRpcProvider;

  constructor(provider: providers.JsonRpcProvider) {
    this.provider = provider;
  }

  public async evaluate(blockData: BlockData, transactionEvaluations: Array<TransactionEvaluation>): Promise<Array<ArbitrageProposal>> {
    const dexQuery = new DEXQuery(this.provider, blockData)

    const liquidationOffers: Array<LiquidationOffer> = _.chain(transactionEvaluations)
      .flatMap("specificActions")
      .map("liquidation")
      .compact()
      .value();
    const arbitrageProposals = new Array<ArbitrageProposal>()
    for (const liquidationOffer of liquidationOffers) {
      console.log("\n\n\n")
      // printTransactionInfo(transaction);
      // transaction.tokenTracker.print()
      // const profits = await transaction.tokenTracker.getProfitsInToken(dexQuery, WETH);
      // printProfits(profits);

      // for (const liquidation of transaction.liquidations) {
      //   const offer = liquidation.offer;
      console.log("aave" + " " + liquidationOffer.liquidationDetails)
      // liquidation.tokenTracker.print()
      // const liquidationProfits = await liquidation.tokenTracker.getProfitsInToken(dexQuery, WETH);
      // printProfits(liquidationProfits);

      const bestOutput = await dexQuery.getBestPrice(liquidationOffer.destToken, liquidationOffer.sourceToken, liquidationOffer.destAmount);
      if (bestOutput === undefined) {
        console.log("Could not get price for arb")
        continue
      }
      const profit = bestOutput.amount.sub(liquidationOffer.sourceAmount);
      const profitInEth = await dexQuery.getBestPrice(liquidationOffer.sourceToken, WETH, profit)
      if (profitInEth === undefined) {
        console.log("Could not get price for arb")
        continue
      }

      const arbitrageProposal: ArbitrageProposal = {
        source: "aave",
        liquidationDetails: liquidationOffer.liquidationDetails,
        dex: bestOutput.dex,
        dexPath: bestOutput.details,
        token: liquidationOffer.sourceToken,
        profit: profit,
        profitInEth: profitInEth.amount,
        input: liquidationOffer.sourceAmount,
        output: bestOutput.amount
      };
      arbitrageProposals.push(arbitrageProposal)
    }
    return arbitrageProposals
  }
}

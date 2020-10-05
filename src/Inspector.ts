import { providers } from "ethers";
import { BlockData } from "./BlockData";
import { LiquidationTransactions } from "./types";

export abstract class Inspector {
  protected provider: providers.JsonRpcProvider;

  constructor(provider: providers.JsonRpcProvider) {
    this.provider = provider;
  }

  abstract async inspect(blockData: BlockData): Promise<Array<LiquidationTransactions>>;
}

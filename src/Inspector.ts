import { providers } from "ethers";
import { BlockData } from "./BlockData";
import { ParitySubCallWithRevert, SpecificAction } from "./types";

export abstract class Inspector {
  protected provider: providers.JsonRpcProvider;

  constructor(provider: providers.JsonRpcProvider) {
    this.provider = provider;
  }

  async inspectViaBlockDataFilter(blockData: BlockData, transactionHash: string | undefined = undefined, traceAddress: Array<number> = []): Promise<Array<SpecificAction>> {
    return this.inspect(blockData.getFilteredCalls(transactionHash, traceAddress))
  }

  abstract async inspect(calls: Array<ParitySubCallWithRevert>): Promise<Array<SpecificAction>>;
}

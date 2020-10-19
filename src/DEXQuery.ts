import { Contract, providers } from "ethers";
import { BigNumber } from "@ethersproject/bignumber";
import * as _ from "lodash";

import { BlockData } from "./BlockData";
import { maxDexResult, minDexResult} from "./utils";
import { WETH } from "./config/addresses";
import { UNISWAP_ROUTER_ABI } from './config/abi';

export type DEX = 'UniswapV2' | 'UniswapV1' | 'identity' | ''

export interface DexResult {
  dex: DEX;
  details: Array<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  amount: BigNumber;
}

export class DEXQuery {
  private provider: providers.JsonRpcProvider;
  private blockData: BlockData;
  private uniswapRouter: Contract;
  private sushiswapRouter: Contract;

  constructor(provider: providers.JsonRpcProvider, blockData: BlockData) {
    this.provider = provider;
    this.blockData = blockData;
    this.uniswapRouter = new Contract("0x7a250d5630b4cf539739df2c5dacb4c659f2488d", UNISWAP_ROUTER_ABI, provider);
    this.sushiswapRouter = new Contract("0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F", UNISWAP_ROUTER_ABI, provider);
  }

  async getBestPrice(sourceToken: string, destToken: string, amount: BigNumber, isSourceAmount = true ): Promise<DexResult|undefined> {
    if (sourceToken === "ETH") sourceToken = WETH;
    if (destToken === "ETH") destToken = WETH;

    if (sourceToken.toLowerCase() === destToken.toLowerCase()) {
      return {
        amount: amount,
        details: ['identity'],
        dex: 'identity'
      }
    }
    const pricePromises = [
      this.uniswapV2(this.uniswapRouter, [sourceToken, destToken], amount, isSourceAmount),
      this.uniswapV2(this.sushiswapRouter, [sourceToken, destToken], amount, isSourceAmount),
    ]
    if (sourceToken !== WETH && destToken !== WETH ) {
      pricePromises.push( this.uniswapV2(this.uniswapRouter, [sourceToken, WETH, destToken], amount, isSourceAmount))
      pricePromises.push( this.uniswapV2(this.sushiswapRouter, [sourceToken, WETH, destToken], amount, isSourceAmount))
    }
    // We want to look for largest output or smallest input
    const priceQueries = _.compact(await Promise.all(pricePromises))
    return isSourceAmount ? maxDexResult(priceQueries) : minDexResult(priceQueries);
  }

  private async uniswapV2(uniswapRouter: Contract, uniswapPath: Array<string>, sourceAmount: BigNumber, isSourceAmount: boolean): Promise<DexResult | undefined> {
    try {
      const amountsOut = await uniswapRouter.functions[isSourceAmount ? 'getAmountsOut' : 'getAmountsIn'](
        sourceAmount,
        uniswapPath,
        {blockTag: this.blockData.block.number}
      );
      const amountOfDestToken = amountsOut[0][isSourceAmount ? uniswapPath.length - 1 : 0];
      return {
        dex: "UniswapV2",
        details: [uniswapRouter.address, uniswapPath],
        amount: amountOfDestToken
      }
    } catch (e) {
      return undefined
    }
  }
}

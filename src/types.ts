import { TransactionReceipt, TransactionResponse } from "@ethersproject/abstract-provider";
import { TokenTracker } from "./TokenTracker";
import { BigNumber } from "ethers";
import { DEX } from "./DEXQuery";
import { TransactionDescription } from "ethers/lib/utils";

type CallType = 'call' | 'delegatecall' | 'staticcall' | 'create' | 'create2' | 'suicide'

export interface LiquidationTransactions {
  transaction: TransactionResponse;
  transactionReceipt: TransactionReceipt;
  tokenTracker: TokenTracker;
  transactionCalls: Array<ParitySubCallWithRevert>
  liquidations: Array<LiquidationDetails>;
}

export interface LiquidationDetails {
  tokenTracker: TokenTracker;
  parsedLiquidationCall: TransactionDescription;
  offer: LiquidationOffer;
  liquidationCall: ParitySubCallWithRevert;
}

export interface LiquidationOffer {
  destToken: string;
  destAmount: BigNumber;
  sourceToken: string;
  sourceAmount: BigNumber;
  source: string;
  liquidationDetails: string;
}

export interface ParitySubCallAction {
  callType: CallType;
  from: string;
  gas: string;
  input: string;
  to: string | undefined; // contract call
  value: string;
}

export interface ParitySubCallWithRevert extends ParitySubCall {
  reverted: boolean
}
export interface ParitySubCall {
  action: ParitySubCallAction;
  result: {
    gasUsed: string;
    output: string;
  };
  subtraces: number;
  traceAddress: Array<number>;
  transactionHash: string;
  type: CallType;
  error?: 'Reverted'
}

export interface ArbitrageProposal {
  output: BigNumber;
  input: BigNumber;
  dexPath: any;
  dex: DEX;
  source: string;
  profit: BigNumber;
  liquidationDetails: string;
  profitInEth: BigNumber;
  token: string;
}

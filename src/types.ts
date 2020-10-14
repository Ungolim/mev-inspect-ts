import { providers, BigNumber } from "ethers";

import { DEX } from "./DEXQuery";

export enum ACTION_PROVIDER {
  AAVE,
  COMPOUND,
  UNISWAP,
  SUSHISWAP,
  CURVE,
  ZEROX,
  BALANCER,
}

export enum ACTION_TYPE {
  TRANSFER,
  LIQUIDATION,
  TRADE,
}

export enum STATUS {
  REVERTED,
  CHECKED,
  SUCCESS
}

export enum TRANSACTION_TYPE {
  UKNOWN,
  ARBITRAGE,
  LIQUIDATION,
}

export interface Action {
  subcall: ParitySubCallWithRevert,
  transactionHash: string;
  provider: ACTION_PROVIDER;
  type: ACTION_TYPE;
  status: STATUS;
  actionCalls: Array<ParitySubCallWithRevert>
}

export interface LiquidationOffer {
  destToken: string;
  destAmount: BigNumber;
  sourceToken: string;
  sourceAmount: BigNumber;
  liquidationDetails: string;
}
export interface LiquidationAction extends Action {
  type: ACTION_TYPE.LIQUIDATION;
  liquidation?: LiquidationOffer;
}

interface TradeDetails {
  destToken: string;
  destAmount: BigNumber;
  sourceToken: string;
  sourceAmount: BigNumber;
}
export interface TradeAction extends Action {
  type: ACTION_TYPE.TRADE;
  trade?: TradeDetails;
}

interface TransferDetails {
  from: string;
  to: string;
  token: string;
  value: BigNumber;
}
export interface TransferAction extends Action {
  type: ACTION_TYPE.TRANSFER;
  transfer?: TransferDetails;
}

export type SpecificAction = LiquidationAction | TransferAction | TradeAction

export interface txTypeWithStatus {
  type: TRANSACTION_TYPE
  success: boolean
}

export interface TransactionEvaluation {
  transactionHash: string;
  transaction: providers.TransactionResponse,
  transactionReceipt: providers.TransactionReceipt,
  specificActions: SpecificAction[],
  calls: ParitySubCallWithRevert[],
  unknownCalls: ParitySubCallWithRevert[],
  inferredType: txTypeWithStatus
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


type ParityCallType = 'call' | 'delegatecall' | 'staticcall' | 'create' | 'create2' | 'suicide' | 'reward'

export interface ParitySubCallAction {
  callType: ParityCallType;
  from: string;
  gas: string;
  input: string;
  to: string | undefined;
  value: string;
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
  type: ParityCallType;
  error?: 'Reverted'
}

export interface ParitySubCallWithRevert extends ParitySubCall {
  reverted: boolean
}

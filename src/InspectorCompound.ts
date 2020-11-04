import { BigNumber, Contract, providers } from 'ethers'
import * as _ from "lodash";
import { Interface, TransactionDescription, parseEther } from "ethers/lib/utils";

import { getSigHashes, subcallMatch } from "./utils";
import { Inspector } from "./Inspector";
import { ERC20_ABI, COMPOUND_CTOKEN_ABI, COMPOUND_CETHER_ABI, COMPOUND_COMPTROLLER_ABI } from "./config/abi";
import { COMPOUND_COMPTROLLER_ADDRESS, COMPOUND_CETHER_ADDRESS, WETH } from "./config/addresses";
import {
  ACTION_PROVIDER,
  ACTION_TYPE,
  LiquidationAction, LiquidationOffer,
  ParitySubCallWithRevert,
  SpecificAction,
  ACTION_STATUS
} from "./types";
import { toLower } from 'lodash';
import { checkServerIdentity } from 'tls';

export class InspectorCompound extends Inspector {
  public cTokenContract: Interface;
  public cEtherContract: Interface;
  private static liquidationFunctionName = 'liquidateBorrow';
  private cTokenLiquidationSig: string;
  private cEtherLiquidationSig: string;
  public cTokenAddresses: Array<string>;
  public underlyingAddresses: Record<string, string>;

  constructor(provider: providers.JsonRpcProvider, cTokenAddresses: Array<string>, underlyingAddresses: Record<string, string>) {
    super(provider);

    this.cTokenContract = new Interface(COMPOUND_CTOKEN_ABI);
    this.cTokenLiquidationSig = this.cTokenContract.getSighash(this.cTokenContract.getFunction(InspectorCompound.liquidationFunctionName));
    this.cEtherContract = new Interface(COMPOUND_CETHER_ABI);
    this.cEtherLiquidationSig = this.cEtherContract.getSighash(this.cEtherContract.getFunction(InspectorCompound.liquidationFunctionName));
    this.cTokenAddresses = cTokenAddresses;
    this.underlyingAddresses = underlyingAddresses;
    // console.log(this.cTokenAddresses);
    // console.log(this.underlyingAddresses);

  }

  static async create(provider: providers.JsonRpcProvider): Promise<InspectorCompound> {
    const comptrollerContract = new Contract(COMPOUND_COMPTROLLER_ADDRESS, COMPOUND_COMPTROLLER_ABI, provider);
    const cTokenAddresses = (await comptrollerContract.getAllMarkets() as Array<string>).map((address) => address.toLowerCase());
    let underlyingAddresses: Record<string, string> = {}; 
  
    const cTokenContract = new Interface(COMPOUND_CTOKEN_ABI);
    for (const cTokenAddress of cTokenAddresses){
      if (cTokenAddress !== COMPOUND_CETHER_ADDRESS.toLowerCase()){ // cEther doesn't implement underlying(), handle separately
        const cTokenContract = new Contract(cTokenAddress, COMPOUND_CTOKEN_ABI, provider);
        const underlyingAddress = await cTokenContract.underlying();
        underlyingAddresses[cTokenAddress.toLowerCase()] = underlyingAddress.toLowerCase();
      }
      else {
        underlyingAddresses[cTokenAddress.toLowerCase()] = WETH.toLowerCase(); // use WETH for tracking cEther underlying, although Compound uses ETH directly
      }
    }

    return new InspectorCompound(provider, cTokenAddresses, underlyingAddresses)
  }

  async inspect(calls: Array<ParitySubCallWithRevert>): Promise<Array<SpecificAction>> {
    const result = new Array<SpecificAction>()
    const unknownCalls = _.clone(calls)

    const liquidationCalls = _.filter(unknownCalls, (call) =>
      (this.cTokenAddresses.some((address) => call.action.to === address)) && (call.action.input.startsWith(this.cTokenLiquidationSig) || call.action.input.startsWith(this.cEtherLiquidationSig)))
    
    for (const liquidationCall of liquidationCalls) {
      //////////////////////////////////////
      // Parse liquidation call and subcalls
      //
      let parsedLiquidationCall: TransactionDescription;
      // cEther case
      if (liquidationCall.action.to === COMPOUND_CETHER_ADDRESS.toLowerCase()) {
        parsedLiquidationCall = this.cEtherContract.parseTransaction({data: liquidationCall.action.input});
      }
      // cToken case
      else {
        parsedLiquidationCall = this.cTokenContract.parseTransaction({data: liquidationCall.action.input});
      }
        
      const subCallsOfLiquidation = _.remove(unknownCalls, call => {
        return call.transactionHash === liquidationCall.transactionHash &&
        subcallMatch(call, liquidationCall.traceAddress)
      })
      

      ////////////////////////////////////
      // Recover underlying and collateral
      //
      const collateral: string = parsedLiquidationCall.args.cTokenCollateral.toLowerCase()
      const cTokenAddress: string = liquidationCall.action.to ?? ""; // should never be empty, need check for casting purposes
      const underlying: string = this.underlyingAddresses[cTokenAddress];
      const ZERO = BigNumber.from(0);
      // console.log("Underlying: ", underlying);
      // console.log("Collateral: ", collateral);
            
      const liquidationOffer: LiquidationOffer = {
        sourceToken: underlying, 
        destAmount: ZERO,
        sourceAmount: ZERO,
        destToken: collateral,
        liquidationDetails: parsedLiquidationCall.args._borrower
      }


      ///////////////////////////
      // Handle reverted calls
      //
      if (liquidationCall.reverted) {
        result.push({
          provider: ACTION_PROVIDER.COMPOUND,
          type: ACTION_TYPE.LIQUIDATION,
          actionCalls: subCallsOfLiquidation,
          transactionHash: liquidationCall.transactionHash,
          subcall: liquidationCall,
          status: ACTION_STATUS.REVERTED,
          liquidation: liquidationOffer
        })
        continue
      }


      ////////////////////////////
      // Parse collateral transfer
      //
      const cTokenContract = new Interface(COMPOUND_CTOKEN_ABI);
      const collateralCall = _.filter(subCallsOfLiquidation, call => {
        return call.action.to === collateral && call.action.callType === "call"
      });
    
      const collateralTransferDecode = cTokenContract.parseTransaction({data: collateralCall[1].action.input});
      liquidationOffer.destAmount = collateralTransferDecode.args.seizeTokens;
      // console.log("liquidationOffer.destAmount: ", liquidationOffer.destAmount);
      

      ////////////////////////////
      // Parse underlying transfer
      //
      let callStatus;
      
      // ETH case
      if (liquidationCall.action.to === COMPOUND_CETHER_ADDRESS.toLowerCase()){
        liquidationOffer.sourceAmount = BigNumber.from(liquidationCall.action.value);

        // No return value for CETHER liquidations, reverts on error (handled above)
        callStatus = ACTION_STATUS.SUCCESS;
      }
      
      // ERC20 case
      else {
        const erc20Contract = new Interface(ERC20_ABI);
        const underlyingCall = _.filter(subCallsOfLiquidation, call => {
          return call.action.to === underlying && call.action.callType === "call"
        });
        
        const underlyingTransferDecode = erc20Contract.parseTransaction({data: underlyingCall[0].action.input});
        liquidationOffer.sourceAmount = underlyingTransferDecode.args.value
        
        // // Sanity check: these should macth, as the underlying amount is passed as parameter
        // console.log("liquidationOffer.sourceAmount: ", liquidationOffer.sourceAmount);
        // console.log("calldata argument repayAmount: ", parsedLiquidationCall.args.repayAmount);
        
        // If return code is 0, liquidation was successful, otherwise it failed, label as "CHECKED"
        const ZERO_STRING = "0x0000000000000000000000000000000000000000000000000000000000000000";
        callStatus = liquidationCall.result.output === ZERO_STRING ? ACTION_STATUS.SUCCESS : ACTION_STATUS.CHECKED;
      }

      
      ///////////////////////////
      // Record LiquidationAction
      //
      const action: LiquidationAction = {
        provider: ACTION_PROVIDER.COMPOUND,
        type: ACTION_TYPE.LIQUIDATION,
        actionCalls: subCallsOfLiquidation,
        transactionHash: liquidationCall.transactionHash,
        subcall: liquidationCall,
        status: callStatus,
        liquidation: liquidationOffer
      };

      result.push(action)
    }

    if (liquidationCalls.length > 0) {
      return result
    }

    // TODO: implement opportunity checks
    //
    // If we haven't found a liquidation call that happened, see if there was a preflight
    // const liquidationPreflightCalls = _.filter(unknownCalls, (call) =>
    //   ((call.action.to === LENDING_POOL_ADDRESS.toLowerCase() && call.action.input.startsWith("0xbf92857c")) ||
    //     (call.action.to === LENDING_POOL_CORE_ADDRESS.toLowerCase() && call.action.input.startsWith("0x66d103f3")
    //     )))  // getUserAccountData

    // for (const liquidationPreflightCall of liquidationPreflightCalls) {
    //   const subCallsOfLiquidationPreflight = _.remove(unknownCalls, call => {
    //     return call.transactionHash === liquidationPreflightCall.transactionHash &&
    //       subcallMatch(call, liquidationPreflightCall.traceAddress)
    //   })

    //   result.push({
    //     provider: ACTION_PROVIDER.AAVE,
    //     type: ACTION_TYPE.LIQUIDATION,
    //     actionCalls: subCallsOfLiquidationPreflight,
    //     transactionHash: liquidationPreflightCall.transactionHash,
    //     subcall: liquidationPreflightCall,
    //     status: ACTION_STATUS.CHECKED,
    //   })
    // }
    return result
  }
}

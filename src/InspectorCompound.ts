import { BigNumber, Contract, providers } from 'ethers'
import * as _ from "lodash";
import { Interface, TransactionDescription, parseEther } from "ethers/lib/utils";

import { getSigHashes, subcallMatch } from "./utils";
import { Inspector } from "./Inspector";
import { ERC20_ABI, COMPOUND_CTOKEN_ABI, COMPOUND_CETHER_ABI, COMPOUND_COMPTROLLER_ABI, COMPOUND_ORACLE_ABI } from "./config/abi";
import { COMPOUND_COMPTROLLER_ADDRESS, COMPOUND_CETHER_ADDRESS, WETH, COMPOUND_ORACLE_ADDRESS } from "./config/addresses";
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
  public cTokenInterface: Interface;
  public cEtherInterface: Interface;
  private static liquidationFunctionName = 'liquidateBorrow';
  private static liquidationAllowedFunctionName = 'liquidateBorrowAllowed';
  private static oracleGetPriceFunctionName = 'getUnderlyingPrice';

  private cTokenLiquidationSig: string;
  private cEtherLiquidationSig: string;
  public cTokenAddresses: Array<string>;
  public underlyingAddresses: Record<string, string>;

  constructor(provider: providers.JsonRpcProvider, cTokenAddresses: Array<string>, underlyingAddresses: Record<string, string>) {
    super(provider);

    this.cTokenInterface = new Interface(COMPOUND_CTOKEN_ABI);
    this.cTokenLiquidationSig = this.cTokenInterface.getSighash(this.cTokenInterface.getFunction(InspectorCompound.liquidationFunctionName));
    this.cEtherInterface = new Interface(COMPOUND_CETHER_ABI);
    this.cEtherLiquidationSig = this.cEtherInterface.getSighash(this.cEtherInterface.getFunction(InspectorCompound.liquidationFunctionName));
    this.cTokenAddresses = cTokenAddresses;
    this.underlyingAddresses = underlyingAddresses;
  }

  static async create(provider: providers.JsonRpcProvider): Promise<InspectorCompound> {
    const comptrollerContract = new Contract(COMPOUND_COMPTROLLER_ADDRESS, COMPOUND_COMPTROLLER_ABI, provider);
    const cTokenAddresses = (await comptrollerContract.getAllMarkets() as Array<string>).map((address) => address.toLowerCase());
    let underlyingAddresses: Record<string, string> = {}; 
  
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
        parsedLiquidationCall = this.cEtherInterface.parseTransaction({data: liquidationCall.action.input});
      }
      // cToken case
      else {
        parsedLiquidationCall = this.cTokenInterface.parseTransaction({data: liquidationCall.action.input});
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
            
      const liquidationOffer: LiquidationOffer = {
        sourceToken: underlying, 
        destAmount: ZERO,
        sourceAmount: ZERO,
        destToken: collateral,
        liquidationDetails: parsedLiquidationCall.args._borrower
      }


      /////////////////////////////////////////////////////////
      // Handle reverted calls (failed liquidations for cETHER)
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

      ///////////////////////////////////////////
      // Handle failed liquidations (for cERC20s)
      //
      let callStatus;
      if (liquidationCall.action.to !== COMPOUND_CETHER_ADDRESS.toLowerCase()){
        // If return code is 0, liquidation was successful, otherwise it failed, label as "CHECKED"
        const ZERO_STRING = "0x0000000000000000000000000000000000000000000000000000000000000000";
        callStatus = liquidationCall.result.output === ZERO_STRING ? ACTION_STATUS.SUCCESS : ACTION_STATUS.CHECKED;
      }
      else {
        callStatus = ACTION_STATUS.SUCCESS;
      }

      ////////////////////////////////////////////
      // Parse amounts for successful liquidations
      //
      if (callStatus === ACTION_STATUS.SUCCESS) {
        
        // Parse collateral transfer
        const collateralCall = _.filter(subCallsOfLiquidation, call => {
          return call.action.to === collateral && call.action.callType === "call";
        });
        const collateralTransferDecode = this.cTokenInterface.parseTransaction({data: collateralCall[1].action.input});
        liquidationOffer.destAmount = collateralTransferDecode.args.seizeTokens;
        
        // Parse underlying transfer
        
        // ETH case
        if (liquidationCall.action.to === COMPOUND_CETHER_ADDRESS.toLowerCase()){
          liquidationOffer.sourceAmount = BigNumber.from(liquidationCall.action.value);
        }
        
        // ERC20 case
        else {
          const erc20Contract = new Interface(ERC20_ABI);
          const underlyingCall = _.filter(subCallsOfLiquidation, call => {
            return call.action.to === underlying && call.action.callType === "call";
          });
          
          const underlyingTransferDecode = erc20Contract.parseTransaction({data: underlyingCall[0].action.input});
          liquidationOffer.sourceAmount = underlyingTransferDecode.args.value;  
        }
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

    /////////////////////
    // Opportunity checks
    //
    const comptrollerContract = new Interface(COMPOUND_COMPTROLLER_ABI);
    const comptrollerLiquidationAllowedSig = comptrollerContract.getSighash(comptrollerContract.getFunction(InspectorCompound.liquidationAllowedFunctionName));
    const oracleContract = new Interface(COMPOUND_ORACLE_ABI);
    const oracleGetPriceSig = oracleContract.getSighash(oracleContract.getFunction(InspectorCompound.oracleGetPriceFunctionName));
    
    const liquidationPreflightCalls = _.filter(unknownCalls, (call) =>
      (
        // Validate liquidation
        call.action.to === COMPOUND_COMPTROLLER_ADDRESS.toLowerCase() && call.action.input.startsWith(comptrollerLiquidationAllowedSig)
      ) 
      ||
      (
        // Check oracle price
        call.action.to === COMPOUND_ORACLE_ADDRESS.toLowerCase() && call.action.input.startsWith(oracleGetPriceSig)
      )
    )

    for (const liquidationPreflightCall of liquidationPreflightCalls) {
      const subCallsOfLiquidationPreflight = _.remove(unknownCalls, call => {
        return call.transactionHash === liquidationPreflightCall.transactionHash &&
          subcallMatch(call, liquidationPreflightCall.traceAddress)
        })

      result.push({
        provider: ACTION_PROVIDER.COMPOUND,
        type: ACTION_TYPE.LIQUIDATION,
        actionCalls: subCallsOfLiquidationPreflight,
        transactionHash: liquidationPreflightCall.transactionHash,
        subcall: liquidationPreflightCall,
        status: ACTION_STATUS.CHECKED,
      })
    }

    return result
  }
}

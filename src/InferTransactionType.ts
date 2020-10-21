import * as _ from "lodash";
import {
  ACTION_STATUS,
  ACTION_TYPE,
  ParitySubCallWithRevert,
  SpecificAction,
  TRANSACTION_STATUS,
  TRANSACTION_TYPE,
  txTypeWithStatus
} from "./types";

export class InferTransactionType {
  infer(specificActions: SpecificAction[], calls: Array<ParitySubCallWithRevert>): txTypeWithStatus {
    const actionsByType = _.groupBy(specificActions, "type")
    if (actionsByType[ACTION_TYPE.LIQUIDATION]) {
      const performedLiquidation = _.some(actionsByType[ACTION_TYPE.LIQUIDATION], liquidationAction => liquidationAction.status == ACTION_STATUS.SUCCESS);
      return {
        type: TRANSACTION_TYPE.LIQUIDATION,
        status: performedLiquidation ? TRANSACTION_STATUS.SUCCESS : TRANSACTION_STATUS.CHECKED
      }
    }

    const tradesBySuccess = _.groupBy(actionsByType[ACTION_TYPE.TRADE], liquidationAction => liquidationAction.status)
    if (_.size(tradesBySuccess[ACTION_STATUS.SUCCESS]) > 1) {
      return {
        type: TRANSACTION_TYPE.ARBITRAGE,
        status: TRANSACTION_STATUS.SUCCESS
      }
    } else if (_.size(tradesBySuccess[ACTION_STATUS.CHECKED]) > 1) {
      return {
        type: TRANSACTION_TYPE.ARBITRAGE,
        status: TRANSACTION_STATUS.CHECKED
      }
    }

    if (_.size(actionsByType[ACTION_TYPE.KNOWN_BOT]) === 1) {
      const actionsBySuccess = _.groupBy(specificActions, "status")
      const status = _.size(actionsBySuccess[ACTION_STATUS.SUCCESS]) > 0 ?
        TRANSACTION_STATUS.SUCCESS :
        _.size(actionsBySuccess[ACTION_STATUS.CHECKED]) > 0 ?
          TRANSACTION_STATUS.CHECKED :
          TRANSACTION_STATUS.UNKNOWN
      return {
        type: TRANSACTION_TYPE.UNCLASSIFIED_BOT,
        status
      }
    }
    return {
      type: TRANSACTION_TYPE.UNKNOWN,
      status: TRANSACTION_STATUS.UNKNOWN
    }
  }
}

import * as _ from "lodash";
import { ACTION_TYPE, txTypeWithStatus, ParitySubCallWithRevert, SpecificAction, STATUS, TRANSACTION_TYPE } from "./types";

export class InferTransactionType {
  infer(specificActions: SpecificAction[], calls: Array<ParitySubCallWithRevert>): txTypeWithStatus {
    const byType = _.groupBy(specificActions, "type")
    if (byType[ACTION_TYPE.LIQUIDATION]) {
      return {
        type: TRANSACTION_TYPE.LIQUIDATION,
        success: _.some(byType[ACTION_TYPE.LIQUIDATION], liquidationAction => liquidationAction.status == STATUS.SUCCESS)
      }
    }

    const tradesBySuccess = _.chain(byType[ACTION_TYPE.TRADE])
      .groupBy(liquidationAction => liquidationAction.status)
      .value()
    if (_.size(tradesBySuccess[STATUS.SUCCESS]) > 1) {
      return {
        type: TRANSACTION_TYPE.ARBITRAGE,
        success: true
      }
    } else if (_.size(tradesBySuccess[STATUS.CHECKED]) > 1) {
      return {
        type: TRANSACTION_TYPE.ARBITRAGE,
        success: false
      }
    }

    return {
      type: TRANSACTION_TYPE.UKNOWN,
      success: true
    }
  }
}

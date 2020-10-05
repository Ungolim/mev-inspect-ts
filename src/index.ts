import { providers } from 'ethers'
import { ConnectionInfo } from "@ethersproject/web";

import { BlockData } from "./BlockData";
import { InspectorAave } from "./InspectorAave";
import { InspectorAll } from "./InspectorAll";
import { Evaluator } from "./Evaluator";

// To hit an old block, you will need an archive node:
const ETHEREUM_URL = process.env.ETHEREUM_URL || "http://127.0.0.1:8545";
const connection: ConnectionInfo = {url: ETHEREUM_URL}

const provider = new providers.JsonRpcProvider(connection, {chainId: 1, ensAddress: '', name: 'mainnet'})

async function doStuff() {
  // let blockData = await BlockData.createFromBlockNumber(provider, "latest");

  // UNCOMMENT ONE OF THE BLOCK NUMBERS BELOW:
  // Interesting Aave
  // const blockNumber = 10906338; // Very profitable
  // const blockNumber = 10907368; // Small profit
  // const blockNumber = 10906339;
  // const blockNumber = 10907241;
  // const blockNumber = 10920674; // one-way liquidation
  // const blockNumber = 10921074; // busy

  // Interesting All
  const blockNumber = 10971399;

  const blockData = await BlockData.createFromBlockNumber(provider, blockNumber);

  // UNCOMMENT ONE OF THE INSPECTORS
  // const inspectorAave = await InspectorAave.create(provider);
  const inspector = new InspectorAll(provider);

  const transactions = await inspector.inspect(blockData);

  const evaluator = new Evaluator(provider)
  await evaluator.evaluate(blockData, transactions)
}

doStuff();


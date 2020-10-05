mev-inspect
===========
This is quick and dirty script which "inspects" an Ethereum block of data, extracting relevant data for inspection (such as liquidation) and "evaluates" the opportunities inside. This evaluation will parse what happened in that specific event, and also what other methods for arbitrage existed at that block height.

To run:
```
npm install
npm run start
```

Environment variable configuration
==================================
The script reads two optional environment variables:

* `ETHEREUM_URL` (http://127.0.0.1:8545) - Ethereum node to connect to
* `CACHE_DIR` (../cache) - Where block trace and log data is cached


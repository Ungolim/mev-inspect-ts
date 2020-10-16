mev-inspect
===========
This is quick and dirty script which "inspects" an Ethereum block of data, extracting relevant data for inspection (such as liquidation) and "evaluates" the opportunities inside. This evaluation will parse what happened in that specific event, and also what other methods for arbitrage existed at that block height.

To run:
```
docker run -d \
  --name docker-influxdb-grafana \
  -p 3003:3003 \
  -p 3004:8083 \
  -p 8086:8086 \
  -v /path/for/influxdb:/var/lib/influxdb \
  -v /path/for/grafana:/var/lib/grafana \
  philhawthorne/docker-influxdb-grafana:edge

npm install
npm run start
```

[philhawthorne/docker-influxdb-grafana Docker Container](https://github.com/philhawthorne/docker-influxdb-grafana) - Simple single-container service for InfluxDB + Grafana

Environment variable configuration
==================================
The script reads two optional environment variables:

* `ETHEREUM_URL` (http://127.0.0.1:8545) - Ethereum node to connect to
* `INFLUX_DB` = (mev)
* `INFLUX_HOST` = (localhost)
* `MEASUREMENT` = (gasUsed)
* `CACHE_DIR` (../cache) - Where block trace and log data is cached



Design
======
This code turned out to be significantly more complex than I expected, I was anticipating like 2 files, but the complexity of evaluating and inferring intent ended up being a much more difficult problem. I would welcome a refactor.

The system operates on these phases:
1. Fetch raw block data (receipts, logs, calls)
2. The `Processor` receives the block data and runs it through an array of "inspectors", which look for interactions with various protocols. 
   * As it "inspects" the call tree, sub-calls of the match are removed from further inspection
   * When an inspector finds an interaction, it classifies and returns it as a "SpecificAction"
3. Once classified, the data is passed along to an array of "Consumer"s. The included ones print out the results in an ASCII table and store the results in InfluxDB.

A raw `for` loop powers the processor currently, but could easily be adapted to run on a block subscription. The InfluxDB consumer wipes all data for the block number it is processing prior to insertion, so re-orgs will be handled.

I have concerns about Influx/Grafana being the right tool for charting sporadic, blockNumber-based data.

TODO
====
* More Inspectors
* Tests - I wasn't sure what this going to do at first, but many components could use tests, especially TokenTracker. Saving a few block cache files and using those as baseline from running tests would be a good starting point.
* Add Consumer for MEV profitability 

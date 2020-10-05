export const ERC20_ABI = [{
  "constant": false,
  "inputs": [],
  "name": "deposit",
  "outputs": [],
  "payable": true,
  "stateMutability": "payable",
  "type": "function"
},
  {
    "constant": false,
    "inputs": [
      {
        "name": "value",
        "type": "uint256"
      }
    ],
    "name": "withdraw",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  }, {
    "constant": false,
    "inputs": [{"name": "from", "type": "address"}, {"name": "value", "type": "uint256"}],
    "name": "burnFrom",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function",
    "signature": "0x79cc6790"
  }, {
    "constant": false,
    "inputs": [{"name": "to", "type": "address"}, {"name": "value", "type": "uint256"}],
    "name": "mint",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function",
    "signature": "0x40c10f19"
  }, {
    "inputs": [{"internalType": "address", "name": "owner", "type": "address"}, {
      "internalType": "address",
      "name": "spender",
      "type": "address"
    }],
    "name": "allowance",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }, {
    "inputs": [{"internalType": "address", "name": "spender", "type": "address"}, {
      "internalType": "uint256",
      "name": "value",
      "type": "uint256"
    }],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }, {
    "inputs": [{"internalType": "address", "name": "owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }, {
    "inputs": [],
    "name": "decimals",
    "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
    "stateMutability": "pure",
    "type": "function"
  }, {
    "inputs": [],
    "name": "name",
    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
    "stateMutability": "pure",
    "type": "function"
  }, {
    "inputs": [],
    "name": "symbol",
    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
    "stateMutability": "pure",
    "type": "function"
  }, {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }, {
    "inputs": [{"internalType": "address", "name": "to", "type": "address"}, {
      "internalType": "uint256",
      "name": "value",
      "type": "uint256"
    }],
    "name": "transfer",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }, {
    "inputs": [{"internalType": "address", "name": "from", "type": "address"}, {
      "internalType": "address",
      "name": "to",
      "type": "address"
    }, {"internalType": "uint256", "name": "value", "type": "uint256"}],
    "name": "transferFrom",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }]


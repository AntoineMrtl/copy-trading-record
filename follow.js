import Web3 from "web3";
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';



const web3 = new Web3('wss://mainnet.infura.io/ws/v3/24d2e31f288a4d8a9a5560dbfe8bd11c');
//const web3 = new Web3(new Web3.providers.HttpProvider("https://eth.llamarpc.com"));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// retreive config params
var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath, "utf8"));

let options = {
    topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
    ]
};

let subscription = web3.eth.subscribe('logs', options);
const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"

// [tokenIn: [tokenIn address, tokenIn amount], tokenOut: [tokenOut address, tokenOut amount]]
var getSwapInfos = function(logs, from, followed_address, value) {
  let transfers = []
  
  formatted_follow_address = "0x000000000000000000000000" + followed_address.substr(2)

  // check if an amount has been paid in eth
  if (value != 0) {
      if (from == followed_address) { // if the followed address is the sender of the tx, he is the one who spent the value amount of eth so we add it to transfers list
        transfers.push(["ETH : " + WETH_ADDRESS, -value]);
      }
  }

  // check the amount (if there is any) of eth received by the followed address
  logs.forEach( (log) => {
    let amountOut = getETHOutAmount(log, formatted_follow_address);

    if (amountOut != undefined) {
      transfers.push(["ETH : " + WETH_ADDRESS, amountOut]);
    }
  })
  
  // get all token transfer by the followed address
  logs.forEach( (log) => {
    let tokenInAndAmount = getTokenInAndAmount(log, formatted_follow_address);

    if (tokenInAndAmount != undefined) {
      transfers.push(tokenInAndAmount);
    }
  })

  // get all token received by the followed address
  logs.forEach( (log) => {
    let tokenInAndAmount = getTokenOutAndAmount(log, formatted_follow_address);

    if (tokenInAndAmount != undefined) {
      transfers.push(tokenInAndAmount);
    }
  })


  // regroup duplicates of the same token
  return regroupDuplicates(transfers);
}

var regroupDuplicates = function(inputList) {
  const outputList = inputList.reduce((acc, [id, value]) => {
    const index = acc.findIndex(([existingId]) => existingId === id);
    if (index === -1) {
      acc.push([id, value]);
    } else {
      acc[index][1] += value;
    }
    return acc;
  }, []);
  return outputList;
}

var getETHOutAmount = function(log, f_account) {
  let result;
  if (log.topics[0] == '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c' && log.topics[1] == f_account) {
    result = parseInt(log.data.toString().substr(2), 16);
  }
  return result;
}


var getTokenInAndAmount = function(log, f_account) {
  let result;
  if (log.topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' && log.topics[1] == f_account) {
    result = [log.address.toLowerCase(), -parseInt(log.data.toString().substr(2), 16)];
  }
  return result;
}

var getTokenOutAndAmount = function(log, f_account) {
  let result;
  if (log.topics[0] == '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' && log.topics[2] == f_account) {
    result = [log.address.toLowerCase(), parseInt(log.data.toString().substr(2), 16)];
  }
  return result;
}

var getTxInfos = async function(hash) {
  let result;
  await web3.eth.getTransaction(hash, function (error, tx) {
    result = {value:tx.value, from:tx.from, inputData:tx.input, contract:tx.to.toLowerCase()}
  });
  await web3.eth.getTransactionReceipt(hash, function (error, tx) {
    result.logs = tx.logs;
  });
  return result;
}



/*
subscription.on('error', err => { throw err });
subscription.on('connected', nr => console.log('Subscription on ERC-20 started with ID %s', nr));
subscription.on('data', event => {
    if (event.topics.length == 3) {
        if (event.topics[1] == f_addr) {
            main(0, event.transactionHash);
        } else if (event.topics[2] == f_addr) {
            main(1, event.transactionHash);
        }
    }
});
*/

var getTokensMovements = async function(hash) {
  let tx = await getTxInfos(hash);
  console.log(tx)
  /*
  let swapInfos = getSwapInfos(tx.logs, tx.from.toLowerCase(), TARGET_ADDR.toLowerCase(), tx.value);

  if (swapInfos != "No token found") {
    swapInfos.forEach( (transfer) => {
      if (transfer[1] > 0) {
        console.log(("Buy " + transfer[1].toString() + " of token : " + transfer[0]).green)
      } else {
        console.log(("Sell " + transfer[1].toString() + " of token : " + transfer[0]).red)
      }
    })
  }
  */
}

const TARGET_ADDR = "0xd06c560ae0c47e3f91f910b293d8a8027576fa1b"
const f_addr = "0x000000000000000000000000" + TARGET_ADDR.substr(2);
getTokensMovements("0xbbccf08915cfb1a172517878f7e0bc58558a1042b0c171796adf1a9129c4b87e")


// complete tx info by hash
/*
{
  blockHash: '0xad2ab2a91a26582621155852bc7fe6812295f03806dfec08773b6321852281d1',
  blockNumber: 17043370,
  contractAddress: null,
  cumulativeGasUsed: 1595144,
  effectiveGasPrice: 29398611727,
  from: '0x9d263af3950c80e3b49abd6def91f803762d65ab',
  gasUsed: 377170,
  logs: [
    {
      address: '0x1111111254EEB25477B68fb85Ed929f73A960582',
      blockHash: '0xad2ab2a91a26582621155852bc7fe6812295f03806dfec08773b6321852281d1',
      blockNumber: 17043370,
      data: '0xc1c092af0aae342964ff123983f30f5ae5d342401cd1492b4d95c3d5bf1e60fd0000000000000000000000000000000000000000000000000000000000000c6c',
      logIndex: 13,
      removed: false,
      topics: [Array],
      transactionHash: '0x0520fdceaf14c4c32024f58a2e3561cbaade1eec2f07673bbeb85e52092b7cec',
      transactionIndex: 3,
      id: 'log_84cd4ce2'
    }
  ],
  logsBloom: '0x00000000000000000000000000000000000000000000000100000800000004001400000000000000010000000000010002004000080000000000000000200810128200000000080000000008000000000000000000400000000000008000000000200000000000010000000000000000000000000000040010000050000000000000000000000000000100000000000000000000000000000000000000100008020000000008040000100080400004000000080000000000000000000000000008002002000000000000100000000000000000000000000000000002000000440010200010808002020400000000000000000000000000000000000000000000',
  status: true,
  to: '0xbd4dbe0cb9136ffb4955ede88ebd5e92222ad09a',
  transactionHash: '0x0520fdceaf14c4c32024f58a2e3561cbaade1eec2f07673bbeb85e52092b7cec',
  transactionIndex: 3,
  type: '0x2'
*/

/*
{
  method: 'swapExactETHForTokens',
  types: [ 'uint256', 'address[]', 'address', 'uint256' ],
  inputs: [
    BigNumber { _hex: '0x142660f46499', _isBigNumber: true },
    [
      'C02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      'f2d91522Fa62FE0E85B96296b38d7F3b1004FD83'
    ],
    '25599b4c5D678299680C84F904001AA7661D77f7',
    BigNumber { _hex: '0x64038467', _isBigNumber: true }
  ],
  names: [ 'amountOutMin', 'path', 'to', 'deadline' ]
}
*/


var getMostLiquidPair = async function(reserves, tokens0, tokens1, block) {
  let i=0;
  let quoteToken;
  let quoteTokenQtt;
  let quoteValueUsd;
  let maxLiquidityUSD = 0;
  let mostLiquidReserveId = 0;
  
  for (var reserve of reserves) {
    let liquidity;

    if (QUOTE_TOKENS_ADDRESSES.includes(tokens0[i])) { // set quoteToken and baseToken ..
      quoteToken = tokens0[i];
      quoteTokenQtt = reserve[0];
    } else {
      quoteToken = tokens1[i];
      quoteTokenQtt = reserve[1];
    }

    console.log(i)
    console.log(quoteToken)

    if (config.QUOTE_PEGED_TOKEN_ADDRESS.includes(quoteToken)) {
      quoteValueUsd = 1;
    } else {
      quoteValueUsd = await getTokenPrice(quoteToken, block);
      quoteValueUsd = quoteValueUsd[0];
    }

    liquidity = (quoteValueUsd * parseInt(quoteTokenQtt)) / (10 ** config.QUOTE_TOKEN_DECIMALS[quoteToken])
    console.log(quoteValueUsd, parseInt(quoteTokenQtt), config.QUOTE_TOKEN_DECIMALS[quoteToken])
    console.log(liquidity)

    if (liquidity > maxLiquidityUSD) {
      maxLiquidityUSD = liquidity;
      mostLiquidReserveId = i;
    }

    i++;
  }
  
  if (maxLiquidityUSD > config.MIN_LIQUIDITY_USD) {
    console.log(reserves[i])
    return {reserve: reserves[i], token0: tokens0[i], token1: tokens1[i]}
  } else {
    return false;
  }
}

var getTokenPrice = async function(tokenAddress, block) {
  tokenAddress = tokenAddress.toLowerCase();

  if (config.QUOTE_PEGED_TOKEN_ADDRESS.includes(tokenAddress)) {
    
    return [1, config.QUOTE_TOKEN_DECIMALS[tokenAddress]];

  } else {

    let token0;
    let token1;

    let reserves = [];
    let tokens0 = [];
    let tokens1 = [];

    // fetch reserves and token0 / token1 data from one of the main pair (if there is any) of the token address
    try {
      let pairAddress;
      for (var quoteToken of QUOTE_TOKENS_ADDRESSES) {
        pairAddress = await FACTORY.methods.getPair(quoteToken, tokenAddress).call()

        if (pairAddress != "0x0000000000000000000000000000000000000000") {
          var _pair = await new web3.eth.Contract(config.PAIR_ABI, pairAddress)
          _pair.defaultBlock = block;

          token0 = await _pair.methods.token0().call();
          token1 = await _pair.methods.token1().call();
      
          tokens0.push(token0.toLowerCase());
          tokens1.push(token1.toLowerCase());

          reserves.push(await _pair.methods.getReserves().call());
        }
      }
      
      if (token0 == "0x0000000000000000000000000000000000000000") { // if no pair were found ..
        console.error("Cannot find major pair with the token ".red + tokenAddress)
      }
    } catch (error) {
        return error
    }

    let pair;

    // get the most liquid pair :
    if (reserves.length > 1 && !config.QUOTE_UNPEGED_TOKEN_ADDRESS.includes(tokenAddress)) {
      pair = await getMostLiquidPair(reserves, tokens0, tokens1, block);
      if (pair == false) {
        console.error("Cannot find major pair with the token ".red + tokenAddress)
      }
    } else {
      pair = {reserve: reserves[0], token0: tokens0[0], token1: tokens1[0]}
    }

    if (tokenAddress == "0xa8b919680258d369114910511cc87595aec0be6d") {
      console.log(pair.reserve, pair.token0, pair.token1)
    }

    let priceInUsd = false;
    let token_decimals;

    // compute the price with reserve values
    let price;
    if (pair.token0 == tokenAddress) {
      // which means token1 is the other main token :
      quoteToken = pair.token1;
      priceInUsd = config.QUOTE_PEGED_TOKEN_ADDRESS.includes(pair.token1); // if token1 is among peged to usd token, then the price is in usd => priceInUsd = true, otherwise, it remains false

      token_decimals = await getTokenDecimals(pair.token0); // get token decimals into a variable to return it to save time in the "GetWalletValue" function

      price = (parseInt(pair.reserve[1]) / (10 ** config.QUOTE_TOKEN_DECIMALS[pair.token1])) / (parseInt(pair.reserve[0]) / (10 ** token_decimals));
      
    } else {
      // which means token0 is the other main token :
      quoteToken = pair.token0;
      priceInUsd = config.QUOTE_PEGED_TOKEN_ADDRESS.includes(pair.token0); // if token1 is among peged to usd token, then the price is in usd => priceInUsd = true, otherwise, it remains false

      token_decimals = await getTokenDecimals(pair.token1); // get token decimals into a variable to return it to save time in the "GetWalletValue" function

      price = (parseInt(pair.reserve[0]) / (10 ** token_decimals)) / (parseInt(pair.reserve[1]) / (10 ** config.QUOTE_TOKEN_DECIMALS[pair.token1]));
    }

    if (priceInUsd == false) {
      price = (await getTokenPrice(quoteToken, block))[0] * price;
    }

    return [price, token_decimals]
  }
}
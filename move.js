import Web3 from 'web3';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import axios from "axios";

const web3 = new Web3('wss://mainnet.infura.io/ws/v3/24d2e31f288a4d8a9a5560dbfe8bd11c');

const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

var configPath = path.join(__dirname + "./../", "config.json");
var config = JSON.parse(fs.readFileSync(configPath, "utf8"));

var sortByAscendingOrder = function(inputList) {
  return inputList.sort((a, b) => a[1] - b[1]);
}

var getAmountEthOut = async function(account, hash) {
  account = account.toLowerCase()

  try {
    let response = await axios.get(`https://api.etherscan.io/api`, {
      params: {
        module: "account",
        action: "txlistinternal",
        txhash: hash,
        apiKey: config.ETHERSCAN_API,
      },
    });

    if (response.data.status === "1" && response.data.result.length > 0) {
      for (const internalTransaction of response.data.result) {
        if (
          internalTransaction.to &&
          internalTransaction.to.toLowerCase() === account &&
          parseFloat(internalTransaction.value) > 0
        ) {
          return internalTransaction.value;
        }
      }
    }
    return false;
  } catch (error) {
    console.error(`Error fetching internal transactions: ${error}`);
    return false;
  }
}

var getSwapInfos = async function(hash, contract, logs, from, followed_address, value) {
  let transfers = []
  
  let formatted_follow_address = "0x000000000000000000000000" + followed_address.substr(2)
  let formatted_from_address = "0x000000000000000000000000" + from.substr(2)

  // TOKEN SENDED ("SOLD") :

  // check if an amount has been paid in eth
  if (value != 0) {
      if (from == followed_address || config.UNISWAP_ROUTERS.includes(contract)) { // if the followed address is the sender of the tx, he is the one who spent the value amount of eth so we add it to transfers list
        transfers.push([WETH_ADDRESS, -value]);
      }
  }
  
  // get all token transfer by the followed address
  logs.forEach( (log) => {
    let tokenInAndAmount = getTokenInAndAmount(log, formatted_follow_address);

    if (tokenInAndAmount != undefined) {
      transfers.push(tokenInAndAmount);
    }
  })

  // TOKEN RECEIVED ("BOUGHT") :

  // get all token received by the followed address
  logs.forEach( (log) => {
    let tokenInAndAmount = getTokenOutAndAmount(log, formatted_follow_address);

    if (tokenInAndAmount != undefined) {
      transfers.push(tokenInAndAmount);
    }
  })

  // check the amount (if there is any) of eth received by the followed address
  logs.forEach( (log) => {
    let amountOut = getETHOutAmount(log, formatted_follow_address);

    if (amountOut != undefined) {
      transfers.push([WETH_ADDRESS, amountOut]);
    }
  })

  let EthOutfromInternal = await getAmountEthOut(followed_address, hash);
  if (EthOutfromInternal != false) {
    transfers.push([WETH_ADDRESS, parseInt(EthOutfromInternal)]);
  }

  if (from != followed_address && config.UNISWAP_ROUTERS.includes(contract)) {
    // get all token transfer by the from address
    logs.forEach( (log) => {
      let tokenInAndAmount = getTokenInAndAmount(log, formatted_from_address);

      if (tokenInAndAmount != undefined) {
        transfers.push(tokenInAndAmount);
      }
    })
  }

  // regroup duplicates of the same token
  transfers = regroupDuplicates(transfers);

  // sort by ascending order (to have the "sold" token first) 
  return sortByAscendingOrder(transfers);

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
  if (log.topics[0] == '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65' && log.topics[1] == f_account) {
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
    if (tx.to == null) {
      return null
    }
    result = {value:tx.value, from:tx.from, inputData:tx.input, contract:tx.to.toLowerCase()}
  });
  await web3.eth.getTransactionReceipt(hash, function (error, tx) {
    result.logs = tx.logs;

    if (tx.status == false) {
      result = null;
    }
  });

  return result;
}

export default async function getTokensMovements(address, hash) {
  let tx = await getTxInfos(hash);
  let swapInfos;

  if (tx == null) {
    return undefined;
  }

  if (config.ROUTERS_ADDRESSES.includes(tx.contract)) {
    swapInfos = await getSwapInfos(hash, tx.contract, tx.logs, tx.from.toLowerCase(), address.toLowerCase(), tx.value);
  }

  return swapInfos;
}
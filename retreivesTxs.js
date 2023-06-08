import { Alchemy, Network } from "alchemy-sdk";

const _config = {
  apiKey: "zDpU6f787qH64V6r3IoYezAmqCXtqxYl",
  network: Network.ETH_MAINNET,
};

const alchemy = new Alchemy(_config);

var regroupDuplicates = function (inputList) {
  const resultMap = inputList.reduce((map, [id, value]) => {
    if (!map.has(id)) {
      map.set(id, [value]);
    } else {
      map.get(id);
    }
    return map;
  }, new Map());

  return Array.from(resultMap.entries()).map(([id, values]) => [id, ...values]);
}

var sortByAscendingOrder = function (inputList) {
  return inputList.sort((a, b) => a[1] - b[1]);
}

export default async function getAllTxs(address) {
  // starting by fetching all transfers of an address (to be able to even retreive txs not sent by the address by only where it is implied)

  let allTransfers = []

  // fetch first batch of data with "fromAddress" option
  let data = await alchemy.core.getAssetTransfers({
    fromBlock: "0x0",
    fromAddress: address,
    category: ["external", "internal", "erc20"],
  });
  allTransfers = allTransfers.concat(data.transfers);

  // fetch others batch (if there is any) of data with "fromAddress" option
  while (data.pageKey != undefined) { // while there is more data to fetch ..

    data = await alchemy.core.getAssetTransfers({
      fromBlock: "0x0",
      fromAddress: address,
      category: ["external", "internal", "erc20"],
      pageKey: data.pageKey
    });

    allTransfers = allTransfers.concat(data.transfers);
  }

  // fetch first batch of data with "toAddress" option
  data = await alchemy.core.getAssetTransfers({
    fromBlock: "0x0",
    toAddress: address,
    category: ["external", "internal", "erc20"],
  });
  allTransfers = allTransfers.concat(data.transfers);

  // fetch others batch (if there is any) of data with "toAddress" option
  while (data.pageKey != undefined) { // while there is more data to fetch ..

    data = await alchemy.core.getAssetTransfers({
      fromBlock: "0x0",
      toAddress: address,
      category: ["external", "internal", "erc20"],
      pageKey: data.pageKey
    });

    allTransfers = allTransfers.concat(data.transfers);
  }

  // extract all hash and blockNums
  let allHashs = []

  allTransfers.forEach((transfer) => {
    allHashs.push([transfer.hash, parseInt(transfer.blockNum, 16)])
  })

  // regroup duplicates
  allHashs = regroupDuplicates(allHashs);

  // sort by ascending order
  allHashs = sortByAscendingOrder(allHashs);

  let startBlock = allHashs[0][1];
  let endBlock = allHashs[allHashs.length - 1][1];

  return [startBlock, endBlock, allHashs];
}
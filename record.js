// Setup: npm install alchemy-sdk
import getTokensMovements from "./helpers/move.js";
import getAllTxs from "./helpers/retreivesTxs.js";
import { getTokenPrice, getQuoteTokenPrice } from "./helpers/prices.js";

import * as path from "path";
import { fileURLToPath } from "url";
import * as fs from "fs";
import colors from "colors";
import Web3 from "web3";
import ethers from "ethers";
import BigNumber from "bignumber.js";
import { log } from "console";
import { Alchemy, Network } from "alchemy-sdk";
import Chart from "chart.js/auto";

const _config = {
  apiKey: "zDpU6f787qH64V6r3IoYezAmqCXtqxYl",
  network: Network.ETH_MAINNET,
};

const alchemy = new Alchemy(_config);

const web3 = new Web3(
  "wss://mainnet.infura.io/ws/v3/24d2e31f288a4d8a9a5560dbfe8bd11c"
);

const provider = new ethers.providers.JsonRpcProvider(
  "https://eth-rpc.gateway.pokt.network"
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

var configPath = path.join(__dirname, "config.json");
var config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const FACTORY = await new web3.eth.Contract(
  config.FACTORY_ABI,
  config.MAIN_FACTORY_ADDRESS
);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const DEX_SCREENER_API_REQUEST =
  "https://api.dexscreener.com/latest/dex/pairs/ethereum/";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

var getTokenDecimals = async function (address) {
  const tokenContract = await new web3.eth.Contract(
    config.DECIMALS_ABI,
    address
  );
  let decimals;
  try {
    decimals = await tokenContract.methods.decimals().call();
  } catch (e) {
    console.error("Cannot find token " + address + " decimals. " + e);
  }
  return parseInt(decimals);
};

var getWalletValue = async function (wallet, block) {
  let total = 0;
  let listWallet = [];

  for (const [key, value] of Object.entries(wallet))
    listWallet.push([key, value]);

  for (var token of listWallet) {
    // .. we iterate each transfer of tokens
    let price = await getTokenPrice(token[0], block); // get token price in usd

    total += price.priceUSD * BigNumber(token[1]).shiftedBy(-price.decimals);
  }
  return total;
};

var main = async function (address) {
  let result = await getAllTxs(address);

  let startBlock = result[0];
  let endBlock = result[1];
  let blockoffset = endBlock - startBlock;

  let hashs = result[2];
  let wallet = {
    "0xdac17f958d2ee523a2206206994597c13d831ec7": INITIAL_USDT_AMOUNT,
  };

  let initialWalletValue = await getWalletValue(wallet, hashs[0][1]);

  let tokenTransfered;
  let n = 0;
  let valueBeforeTx = 0;
  for (var hash of hashs) {
    let tokensMovement = await getTokensMovements(address, hash[0]);

    if (tokensMovement != [] && tokensMovement != undefined) {
      // if there is any tokens movements ..
      let intProgress = Math.round(
        ((hash[1] - startBlock) / blockoffset) * 100
      );
      let progress = intProgress.toString() + "%";

      // WALLET SIMULATION :

      tokenTransfered = false;
      let realised = 1; // a number between 1 and 0 reprensanting the percentage of the tx amount executed

      if (n % computeWalletValueTime == 0) {
        valueBeforeTx = await getWalletValue(wallet, hash[1]);
      }

      for (var transfer of tokensMovement) {
        // .. we iterate each transfer of tokens

        if (transfer[1] < 0) {
          // if the transfer is a "sell" (transfer out) ..
          if (config.BASE_PEGED_TOKENS_ADDRESSES.includes(transfer[0])) {
            // .. the token must be a "base peged token" (like USDT, USDC, DAI ..), we buy in "MAIN_PEGED_TOKEN_ADDRESS"
            let transferAmount = parseInt(
              BigNumber(transfer[1]).shiftedBy(
                config.TOKENS_DECIMALS[config.MAIN_PEGED_TOKEN_ADDRESS] -
                  config.TOKENS_DECIMALS[transfer[0]]
              )
            );

            wallet[config.MAIN_PEGED_TOKEN_ADDRESS] += transferAmount;
            console.log(
              (
                "[" +
                progress +
                "] Sell " +
                (-transferAmount).toString() +
                " of main USD token"
              ).red + (" ( " + hash[0] + " )").grey
            );
            tokenTransfered = true;
          } else if (
            config.BASE_UNPEGED_TOKENS_ADDRESSES.includes(transfer[0])
          ) {
            // or the token must be a base token (unpeged) to be able to easily buy it
            if (wallet[transfer[0]] == undefined) wallet[transfer[0]] = 0;

            if (wallet[transfer[0]] > -transfer[1]) {
              // if we have enough tokens to simply make the transfer ..

              wallet[transfer[0]] += transfer[1];
              console.log(
                (
                  "[" +
                  progress +
                  "] Sell " +
                  (-transfer[1]).toString() +
                  " of token : " +
                  transfer[0]
                ).red + (" ( " + hash[0] + " )").grey
              );
            } else {
              // sell directly as has much as token we can
              let amountLeft = -(transfer[1] + wallet[transfer[0]]);
              wallet[transfer[0]] = 0;

              // sell the amount left in main usd token
              let unitPrice = await getQuoteTokenPrice(transfer[0], hash[1]); // get unit price in usd of the unpeged token
              let usdValueWithDecimals = parseInt(
                BigNumber(unitPrice * amountLeft).shiftedBy(
                  config.TOKENS_DECIMALS[config.MAIN_PEGED_TOKEN_ADDRESS] -
                    config.TOKENS_DECIMALS[transfer[0]]
                )
              ); // get the price in usd of the total amount transfered (including main usd token decimals)
              wallet[config.MAIN_PEGED_TOKEN_ADDRESS] -= usdValueWithDecimals;

              console.log(
                (
                  "[" +
                  progress +
                  "] Sell " +
                  (-transfer[1]).toString() +
                  " of token : " +
                  transfer[0] +
                  " and of main USD token for the equivalent in the token of " +
                  usdValueWithDecimals.toString()
                ).red + (" ( " + hash[0] + " )").grey
              );
            }
            tokenTransfered = true;
          } else if (
            wallet[transfer[0]] != 0 &&
            wallet[transfer[0]] != undefined
          ) {
            // or the token must be in our wallet

            if (wallet[transfer[0]] >= -transfer[1]) {
              wallet[transfer[0]] += transfer[1];
              console.log(
                (
                  "[" +
                  progress +
                  "] Sell " +
                  (-transfer[1]).toString() +
                  " of token : " +
                  transfer[0]
                ).red + (" ( " + hash[0] + " )").grey
              );
            } else {
              console.log(
                (
                  "[" +
                  progress +
                  "] Sell " +
                  wallet[transfer[0]].toString() +
                  " of token : " +
                  transfer[0]
                ).red + (" ( " + hash[0] + " )").grey
              );

              realised = wallet[transfer[0]] / -transfer[1];
              wallet[transfer[0]] = 0;
            }
            tokenTransfered = true;
          } else {
            // else, we can't do the swap so we abandon this tx
            break;
          }
        } else {
          // else, the transfer is a "buy" (transfer in) ...
          transfer[1] *= realised;

          if (wallet[transfer[0]] == undefined) {
            // if we have 0 amount of this token ..
            wallet[transfer[0]] = transfer[1];
          } else {
            // else, we add to the current amount
            wallet[transfer[0]] += transfer[1];
          }
          tokenTransfered = true;
          console.log(
            (
              "[" +
              progress +
              "] Buy " +
              transfer[1].toString() +
              " of token : " +
              transfer[0]
            ).green + (" ( " + hash[0] + " )").grey
          );
        }
      }

      // DISPLAY :

      if (tokenTransfered) {
        // if there were any changes in the wallet ..

        if (n % logWalletTime == 0) {
          console.log(wallet);
        }

        if (n % computeWalletValueTime == 0) {
          let walletValue = await getWalletValue(wallet, hash[1]);
          var date = new Date(
            (await provider.getBlock(hash[1])).timestamp * 1000
          );

          let pnl = walletValue - initialWalletValue;
          PnLAcrossTime[0].push(pnl);
          PnLAcrossTime[1].push(hash[1]);

          if (WALLET_VALUE_LOG)
            console.log(
              "WALLET VALUE : " +
                walletValue.toString() +
                " / INITIAL VALUE : " +
                initialWalletValue.toString() +
                " ( at " +
                date.getDate() +
                "/" +
                (date.getMonth() + 1) +
                "/" +
                date.getFullYear() +
                " : " +
                date.getHours() +
                "h )"
            );

          console.log("AFTER TRANSACTION : Net PnL : " + pnl.toString());
          console.log(
            (
              "UNEXPECTED WALLET VALUE OFFSET : " +
              (walletValue - valueBeforeTx).toFixed(2).toString()
            ).blue
          );
        }

        await sleep(waitingTime);

        n++;
      }
    }
  }
};

var QUOTE_TOKENS_ADDRESS;

var init = async function () {
  QUOTE_TOKENS_ADDRESS = config.QUOTE_PEGED_TOKENS_ADDRESSES.concat(
    config.QUOTE_UNPEGED_TOKENS_ADDRESSES
  );
};

init();

const logWalletTime = 1;
const computeWalletValueTime = 1;
const waitingTime = 0;
const INITIAL_USDT_AMOUNT = 1000000000000;
const ADDRESS = "0x473d3a2005499301dc353afa9d0c9c5980b5188c";
const WALLET_VALUE_LOG = false;
const STOP_PROGRESS = 10;

let PnLAcrossTime = [[], []];

main(ADDRESS);

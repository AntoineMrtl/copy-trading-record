import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import Web3 from 'web3';
import BigNumber from 'bignumber.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

var configPath = path.join(__dirname + "./../", "config.json");
var config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const web3 = new Web3(config.WEB3_RPC);

const UNISWAP_V2_FACTORY = await new web3.eth.Contract(config.FACTORY_ABI, config.UNISWAP_V2_FACTORY_ADDRESS)
const UNISWAP_V3_FACTORY = await new web3.eth.Contract(config.FACTORY_ABI_V3, config.UNISWAP_V3_FACTORY_ADDRESS)
const SUSHI_SWAP_FACTORY = await new web3.eth.Contract(config.FACTORY_ABI, config.SHUSHI_SWAP_FACTORY_ADDRESS)

const QUOTE_TOKENS_ADDRESSES = config.QUOTE_PEGED_TOKENS_ADDRESSES.concat(config.QUOTE_UNPEGED_TOKENS_ADDRESSES);
const MIN_LIQUIDITY_USD = new BigNumber(config.MIN_LIQUIDITY_USD);
const CHAIN_LINK_DECIMALS = 10 ** 8;

const Q96 = BigNumber(2 ** 96);
const IMPLEMENTATION_SLOT = "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3";

const getQuoteTokenPrice = async (tokenAddress, blockNumber) => {
  let chainLinkContract = await new web3.eth.Contract(config.CHAIN_LINK_ABI, config.QUOTE_UNPEGED_TOKEN_CHAINLINK_CONTRACT[tokenAddress]);
  let price = await chainLinkContract.methods.latestAnswer().call({}, blockNumber);
  return BigNumber(price).div(CHAIN_LINK_DECIMALS);
}

const getTokenBalance = async (tokenAddress, fetchedAddress, blockNumber) => {
  if (config.PROXIED_TOKENS[tokenAddress] == undefined) {
    const tokenContract = await new web3.eth.Contract(config.BALANCE_ABI, tokenAddress);

    return await tokenContract.methods.balanceOf(fetchedAddress).call({}, blockNumber);
  } else {
    const proxyContract = new web3.eth.Contract(config.BALANCE_ABI, tokenAddress);
  
    return await proxyContract.methods.balanceOf(fetchedAddress).call({}, blockNumber);
  }
}

const getTokenPriceByFactoryV3 = async (factory, tokenAddress, blockNumber) => {
  tokenAddress = tokenAddress.toLowerCase();

  if (config.BASE_PEGED_TOKENS_ADDRESSES.includes(tokenAddress)) {
    return {priceUSD: 1, decimals: config.TOKENS_DECIMALS[tokenAddress]};
  }

  // Retrieve the token's decimals
  const tokenDecimals = parseInt(await new web3.eth.Contract(config.DECIMALS_ABI, tokenAddress).methods.decimals().call({}, blockNumber));

  // Find the most liquid pair for the token
  let maxLiquidityUSD = new BigNumber(0);
  let mostLiquidPoolPrice = null;

  for (const quoteTokenAddress of QUOTE_TOKENS_ADDRESSES) {
    for (const fees of [10000, 3000, 500]) {
      // Retrieve the reserves for the pair
      const pairAddress = await factory.methods.getPool(tokenAddress, quoteTokenAddress, fees).call({}, blockNumber);

      if (pairAddress === '0x0000000000000000000000000000000000000000') {
        continue;
      }
      const pair = new web3.eth.Contract(config.PAIR_V3_ABI, pairAddress);
      const liquidityQuoteToken = await getTokenBalance(quoteTokenAddress, pairAddress, blockNumber);

      // Retrieve the price of the quote token
      let quoteTokenPriceUSD;
      if (config.QUOTE_PEGED_TOKENS_ADDRESSES.includes(quoteTokenAddress))
        quoteTokenPriceUSD = new BigNumber(1);
      else
        quoteTokenPriceUSD = new BigNumber(await getQuoteTokenPrice(quoteTokenAddress, blockNumber));

      // Compute usd liquidity
      const liquidityUSD = BigNumber(BigNumber(liquidityQuoteToken).shiftedBy(-config.TOKENS_DECIMALS[quoteTokenAddress]) * quoteTokenPriceUSD);

      // Check if the total liquidity is greater than the minimum threshold and the actual maxLiquidityUSD
      if (liquidityUSD.isGreaterThan(MIN_LIQUIDITY_USD) && liquidityUSD.isGreaterThan(maxLiquidityUSD)) {
        maxLiquidityUSD = liquidityUSD;

        // save in the mostLiquidPoolPrice variable the price of the token in this pool for now (until an another pool with more liquidity)
        const slot0 = await pair.methods.slot0().call({}, 17129861);
        const sqrtRatioX96 = BigNumber(slot0.sqrtPriceX96);
      
        mostLiquidPoolPrice = BigNumber((sqrtRatioX96 / Q96) ** 2).shiftedBy(tokenDecimals - config.TOKENS_DECIMALS[quoteTokenAddress]);
      }
    }
  }

  return {priceUSD: mostLiquidPoolPrice, decimals: tokenDecimals};
};

const getTokenPriceByFactory = async (factory, tokenAddress, blockNumber) => {
  tokenAddress = tokenAddress.toLowerCase();

  if (config.BASE_PEGED_TOKENS_ADDRESSES.includes(tokenAddress)) {
    return {priceUSD: 1, decimals: config.TOKENS_DECIMALS[tokenAddress]};
  }

  // Retrieve the token's decimals
  const tokenDecimals = parseInt(await new web3.eth.Contract(config.DECIMALS_ABI, tokenAddress).methods.decimals().call({}, blockNumber));

  // Find the most liquid pair for the token
  let maxLiquidityUSD = new BigNumber(0);
  let mostLiquidPoolPrice = null;

  for (const quoteTokenAddress of QUOTE_TOKENS_ADDRESSES) {
    // Retrieve the reserves for the pair
    const pairAddress = await factory.methods.getPair(tokenAddress, quoteTokenAddress).call({}, blockNumber);

    if (pairAddress === '0x0000000000000000000000000000000000000000') {
      continue;
    }
    const pair = new web3.eth.Contract(config.PAIR_ABI, pairAddress);
    const reserves = await pair.methods.getReserves().call({}, blockNumber);

    // Retrieve the price of the quote token
    let quoteTokenPriceUSD;
    if (config.QUOTE_PEGED_TOKENS_ADDRESSES.includes(quoteTokenAddress))
      quoteTokenPriceUSD = new BigNumber(1);
    else
      quoteTokenPriceUSD = new BigNumber(await getQuoteTokenPrice(quoteTokenAddress, blockNumber));

    // Compute usd liquidity
    const quoteTokenAmount = new BigNumber(reserves[quoteTokenAddress < tokenAddress ? 0 : 1]);
    const liquidityUSD = new BigNumber(quoteTokenAmount.shiftedBy(-config.TOKENS_DECIMALS[quoteTokenAddress]) * quoteTokenPriceUSD);

    // Check if the total liquidity is greater than the minimum threshold and the actual maxLiquidityUSD
    if (liquidityUSD.isGreaterThan(MIN_LIQUIDITY_USD) && liquidityUSD.isGreaterThan(maxLiquidityUSD)) {
      maxLiquidityUSD = liquidityUSD;

      // save in the mostLiquidPoolPrice variable the price of the token in this pool for now (until an another pool with more liquidity)
      const baseTokenAmount = new BigNumber(reserves[quoteTokenAddress < tokenAddress ? 1 : 0]);
      mostLiquidPoolPrice = liquidityUSD.dividedBy(baseTokenAmount.shiftedBy(-tokenDecimals));
    }
  }

  return {priceUSD: mostLiquidPoolPrice, decimals: tokenDecimals};
};

const getTokenPrice = async (tokenAddress, blockNumber) => {
  let result = await getTokenPriceByFactory(UNISWAP_V2_FACTORY, tokenAddress, blockNumber);

  if (result.priceUSD == null) {
    result = await getTokenPriceByFactoryV3(UNISWAP_V3_FACTORY, tokenAddress, blockNumber);

    if (result.priceUSD == null) {
      result = await getTokenPriceByFactory(SUSHI_SWAP_FACTORY, tokenAddress, blockNumber);
  
      if (result.priceUSD == null) {
        console.error("Couldn't find major pair for the token " + tokenAddress);
      }
    }
  }

  return result;
}

export { getTokenPrice, getQuoteTokenPrice }
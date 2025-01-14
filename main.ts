import { prependTransactionMessageInstructions, createKeyPairSignerFromBytes, getComputeUnitEstimateForTransactionMessageFactory, pipe, createSolanaRpc, address, createTransactionMessage, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions, signTransactionMessageWithSigners, getBase64EncodedWireTransaction } from '@solana/web3.js';
const fs = require("fs"); 
import bs58 from 'bs58';
import { readFileSync } from "fs";
import path = require("path");
import { setWhirlpoolsConfig, swapInstructions } from '@orca-so/whirlpools';
import { 
    getSetComputeUnitLimitInstruction, 
    getSetComputeUnitPriceInstruction 
  } from '@solana-program/compute-budget';
  
  
(async()=>{ 

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const iterations = 1; //сюда вводим количество кругов

  const walletPaths = ['wallets.txt']; // путь к файлу с кошельками
  const wallets = [];
  for (const walletPath of walletPaths) {
    const walletContent = fs.readFileSync(walletPath, 'utf-8');
    const walletLines = walletContent.split('\n');
    for (const walletLine of walletLines) {
      const wallet = walletLine.trim();
      if (wallet) {
        wallets.push(wallet);
      }
    }
  }
  // обабатываем коши, это писала нейросеть, я не оч понимаю что за промис итд, мой закоментированный код можно найти ниже, но он типо медленне
  await Promise.all(wallets.map(async (wallet) => {
    const privateKey = wallet;
    const privateKeyBytes = bs58.decode(privateKey);
    const privateKeyUint = new Uint8Array(privateKeyBytes.buffer, privateKeyBytes.byteOffset, privateKeyBytes.byteLength / Uint8Array.BYTES_PER_ELEMENT); 
    const keyPairBytes = privateKeyUint;
    const signer = await createKeyPairSignerFromBytes(keyPairBytes);
    const walletAddress = signer.address;

  for (let i = 0; i < iterations; i++) {
    console.clear();
  console.log(`iteration ${i + 1} of ${iterations}`);


  // // обабатываем кош
  //   const walletPath = path.join('', 'wallets.txt');
  //   const privateKey = fs.readFileSync(walletPath, 'utf-8').trim();
  //   const privateKeyBytes = bs58.decode(privateKey);
  //   const privateKeyUint = new Uint8Array(privateKeyBytes.buffer, privateKeyBytes.byteOffset, privateKeyBytes.byteLength / Uint8Array.BYTES_PER_ELEMENT); 
  //   fs.writeFileSync('key.json', JSON.stringify(Array.from(privateKeyUint)));
  //   const keyPairPath = path.join('', 'key.json');
  //   const keyPairBytes = new Uint8Array(JSON.parse(readFileSync(keyPairPath, 'utf-8')));
  //   const signer = await createKeyPairSignerFromBytes(keyPairBytes);
  //   const wallet = signer.address;

// подключаемся к эклипс мейннету в орке
    await setWhirlpoolsConfig('eclipseMainnet');
// подключаемся к еклипс рпц
    const rpc = createSolanaRpc("https://eclipse.helius-rpc.com"); //дефолтный эклипс рпц с 25тпс лимитом, если много кошей - желательно заиметь приватный
// балик вытаскиваем
    const { value: balance } = await rpc.getBalance(walletAddress).send();
    const LAMPORTS_PER_ETH = 1_000_000_000; // тоже самое что в солане только с етх
    
    console.log(`Balance for ${walletAddress}: ${Number(balance) / LAMPORTS_PER_ETH} ETH`);
    
    const decimals = 1000000; // если стейбл - отсавляем так , если токен - меняем на 1000000000
    const whirlpoolAddress = address("44w4HrojzxKwxEb3bmjRNcJ4irFhUGBUjrCYecYhPvqq"); // ETH/USDC пул, сюда вставляем пул с токеном на который хотите свапать ETH
    const mintAddress = address("So11111111111111111111111111111111111111112"); // адрес ETH, его свапаем
    const tokenMint = address("AKEWE7Bgh87GPp171b4cJPSSZfmZwQ3KaqYqXoKLNAEE") // менять в зависимости от второго токена в пуле, например для пула ETH/USDC это будет AKEWE7Bgh87GPp171b4cJPSSZfmZwQ3KaqYqXoKLNAEE
    const inputAmount = BigInt(10000); // сколько эфира свапаем, 10000 = 0,00001 eth
 
    // создаем транзакцию свапа
    const { instructions, quote } = await swapInstructions(
        rpc,
        { inputAmount, mint: mintAddress },
        whirlpoolAddress,
        100,
        signer
      );
    // вывод информации о свапе 
    await sleep(1000);
    console.log(`Quote estimated ETH out for ${walletAddress}: ${Number(inputAmount) / LAMPORTS_PER_ETH}, Quote estimated token in: ${Number(quote.tokenEstOut) / decimals}`);
      
    // получаем последний блокхеш
    const latestBlockHash = await rpc.getLatestBlockhash().send();

    //создаем сообщение транзакции
    const transactionMessage = await pipe(
        createTransactionMessage({ version: 0}),
        tx => setTransactionMessageFeePayer(walletAddress, tx),
        tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockHash.value, tx),
        tx => appendTransactionMessageInstructions(instructions, tx)
      )

      //вот это все делаем что бы получить компут юниты и газ\приорити фи, взял фул из оф доков
const getComputeUnitEstimateForTransactionMessage = 
    getComputeUnitEstimateForTransactionMessageFactory({
        rpc
      });
    const computeUnitEstimate = await getComputeUnitEstimateForTransactionMessage(transactionMessage) + 100_000;
    const medianPrioritizationFee = await rpc.getRecentPrioritizationFees()
      .send()
      .then(fees =>
        fees
          .map(fee => Number(fee.prioritizationFee))
          .sort((a, b) => a - b)
          [Math.floor(fees.length / 2)]
      );
    const transactionMessageWithComputeUnitInstructions = await prependTransactionMessageInstructions([
      getSetComputeUnitLimitInstruction({ units: computeUnitEstimate }),
      getSetComputeUnitPriceInstruction({ microLamports: medianPrioritizationFee })
    ], transactionMessage);
    
    // подписываем транзу
    const signedTransaction = await signTransactionMessageWithSigners(transactionMessageWithComputeUnitInstructions)
    // декодируем транзу
    const base64EncodedWireTransaction = getBase64EncodedWireTransaction(signedTransaction);
    
    const timeoutMs = 90000;
    const startTime = Date.now();
    // отправляем транзу сейчас
    while (Date.now() - startTime < timeoutMs) {
        const transactionStartTime = Date.now();
        
        const signature = await rpc.sendTransaction(base64EncodedWireTransaction, {
    maxRetries: BigInt(0),
    skipPreflight: true,
    encoding: 'base64'
  }).send();

// получаем статус транзакции
  const statuses = await rpc.getSignatureStatuses([signature]).send();
  if (statuses.value[0]) {
    if (!statuses.value[0].err) {
      await sleep(1000);
      console.log(`Transaction confirmed for ${walletAddress}: ${signature}`);
      fs.appendFileSync('logs.txt', `Swap for wallet ${walletAddress} ${Number(inputAmount) / LAMPORTS_PER_ETH} eth to ${Number(quote.tokenEstOut) / decimals} tokens: ${signature}\n`);
      break;
    } else {
      await sleep(1000);
      console.error(`Transaction failed for ${walletAddress}: ${statuses.value[0].err.toString()}`);
      break;
    }
    }
    const elapsedTime = Date.now() - transactionStartTime;
     const remainingTime = Math.max(0, 1000 - elapsedTime);
     if (remainingTime > 0) {
       await new Promise(resolve => setTimeout(resolve, remainingTime));
      }
}

await sleep(1000);
console.log(`Starting reverse swap for ${walletAddress}!`);

// Обратный своп токенов в етх
const reverseSwapInputAmount = BigInt(quote.tokenEstOut); // полученное кол-во токенов
const reverseSwapInstructions = await swapInstructions(
  rpc,
  { inputAmount: reverseSwapInputAmount, mint: tokenMint },
  whirlpoolAddress,
  100,
  signer
);

// Вывод информации об обратном свопе
await sleep(1000);
console.log(`Reverse swap Quote estimated token out for ${walletAddress}: ${Number(reverseSwapInputAmount) / decimals}, Reverse swap Quote estimated ETH in: ${Number(reverseSwapInstructions.quote.tokenEstOut) / LAMPORTS_PER_ETH}`);

// Создаем транзакцию обратного свопа
const reverseSwapTransactionMessage = await pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayer(walletAddress, tx),
  tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockHash.value, tx),
  tx => appendTransactionMessageInstructions(reverseSwapInstructions.instructions, tx)
);

  // Подписываем транзу
  const reverseSwapSignedTransaction = await signTransactionMessageWithSigners(reverseSwapTransactionMessage);

  // Декодируем транзу
  const reverseSwapBase64EncodedWireTransaction = getBase64EncodedWireTransaction(reverseSwapSignedTransaction);

  // отправляем обратную транзу сейчас
  while (Date.now() - startTime < timeoutMs) {
      const transactionStartTime = Date.now();
      
      const reverseSignature = await rpc.sendTransaction(reverseSwapBase64EncodedWireTransaction, {
  maxRetries: BigInt(0),
  skipPreflight: true,
  encoding: 'base64'
}).send();

// получаем статус реверс свапа
const statuses = await rpc.getSignatureStatuses([reverseSignature]).send();
if (statuses.value[0]) {
  if (!statuses.value[0].err) {
    await sleep(1000);
    console.log(`Reverse swap transaction confirmed for ${walletAddress}: ${reverseSignature}`);
    fs.appendFileSync ('logs.txt', `Reverse swap for ${walletAddress} ${Number(reverseSwapInputAmount) / decimals} tokens to ${Number(reverseSwapInstructions.quote.tokenEstOut) / LAMPORTS_PER_ETH} eth: ${reverseSignature}\n`);
    break;
  } else {
    await sleep(1000);
    console.error(`Reverse swap transaction failed for ${walletAddress}: ${statuses.value[0].err.toString()}`);
    break;
  }
  }
  const elapsedTime = Date.now() - transactionStartTime;
   const remainingTime = Math.max(0, 1000 - elapsedTime);
   if (remainingTime > 0) {
     await new Promise(resolve => setTimeout(resolve, remainingTime));
    }
}
await sleep(1000);
}}));
})();
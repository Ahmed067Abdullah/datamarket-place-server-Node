const { composeAPI } = require('@iota/core');
const { validateBundleSignatures } = require("@iota/bundle-validator");
const { asTransactionObject } = require('@iota/transaction-converter');
const axios = require('axios');
const config = require('../config');

const get = (req, res) => {
  res.send({ msg: 'Hello World' });
};

const purchaseStream = async (req, res) => {
  // Check Fields
  const packet = req.body;
  if (!packet || !packet.userId || !packet.deviceId || !packet.seed) {
    console.error("purchaseStream failed. Packet: ", packet);
    return res.status(400).json({ error: "Malformed Request", packet });
  }

  try {
    const { firebaseEndPoint, provider, iotaApiVersion, defaultPrice, secretKey } = config;
    const device = (await axios.get(`${firebaseEndPoint}/device?deviceId=${packet.deviceId}`)).data;
    let price = defaultPrice;
    if (device) {
      if ((device.buyers || []).includes(packet.userId)) {
        return res.status(403).json({ error: "Device already bought" });
      }
      if (device.price) {
        price = Number(device.price);
      } else if (device.value) {
        price = Number(device.value);
      }
    } else {
      return res.status(404).json({ error: `Device doesn't exist` });
    }

    const { getBalances, sendTrytes, getLatestInclusion, getNewAddress, prepareTransfers } = composeAPI({ provider });

    // Balance validation code, open for production, commented for development
    // const allAddresses = await getNewAddress(packet.seed, { returnAll: true });
    // const { balances } = await getBalances(allAddresses, 10);
    // const totalBalance = balances.reduce((el, sum) => sum + el, 0);
    // if (price > totalBalance) {
    //   return res.status(404).json({ error: `Insufficient balanc, ${totalBalance}` });
    // }

    const security = 2;

    // Depth or how far to go for tip selection entry point
    const depth = 5

    // Difficulty of Proof-of-Work required to attach transaction to tangle.
    // Minimum value on mainnet & spamnet is `14`, `9` on devnet and other testnets.
    const minWeightMagnitude = 9

    const transfers = [{ address: device.address, value: price }];
    const trytes = await prepareTransfers(packet.seed, transfers);
    const transactions = await sendTrytes(trytes, depth, minWeightMagnitude);
    console.log(transactions)
    const hashes = transactions.map(transaction => transaction.hash);

    let retries = 0;
    while (retries++ < 20) {
      console.log(retries)
      const statuses = await getLatestInclusion(hashes)
      if (statuses.filter(status => status).length === 4) break;
      await new Promise(resolved => setTimeout(resolved, 10000));
    }

    if (transactions) {
      const hashes =
        transactions && transactions.map(transaction => transaction.hash);

      // Find TX on network and parse
      const bundle = await findTx(hashes, provider, iotaApiVersion);

      // Make sure TX is valid
      if (!validateBundleSignatures(bundle)) {
        console.error(
          "purchaseStream failed. Transaction is invalid for: ",
          bundle
        );
        res.status(403).json({ error: "Transaction is Invalid" });
      }

      const payload = {
        userId: packet.userId,
        deviceId: packet.deviceId,
        secretKey
      };
      await axios.post(`${firebaseEndPoint}/boughtDevice`, payload)
      console.log('here');
      return res.json({ success: true });
    }
    return res.status(403).json({
      error: "Purchase failed. Insufficient balance of out of sync"
    });
  } catch (e) {
    console.error("purchaseData failed. Error: ", e);
    return res.status(403).json({ error: e.message });
  }
}

const findTx = (hashes, provider, iotaApiVersion) => {
  return new Promise((resolve, reject) => {
    axios({
      method: 'POST',
      url: provider,
      headers: {
        'Content-Type': 'application/json',
        'X-IOTA-API-Version': iotaApiVersion,
      },
      data: {
        command: 'getTrytes',
        hashes,
      },
    })
      .then(response => {
        const txBundle = response.data.trytes.map(trytes => asTransactionObject(trytes));
        resolve(txBundle);
      })
      .catch(error => {
        console.error(`findTx failed. Couldn't find your transaction`);
        reject(`findTx failed. Couldn't find your transaction`);
      });
  });
};

module.exports = {
  get,
  purchaseStream
};

const { composeAPI } = require('@iota/core');
const { validateBundleSignatures } = require("@iota/bundle-validator");
const { asTransactionObject } = require('@iota/transaction-converter');
const axios = require('axios');
const config = require('../config');
const getMessages = require('../utils/buyingStepsMessages');

const get = (req, res) => {
  res.send({ msg: 'Hello World' });
};


// To change for production
// 1) uncomment code to check for availability of balance (Line # 51 - 57)
// 2) put actual value of device in the array of config instead of current hardcoded 0 (Line # 69)
// 3) uncomment code to update firebase collections (Line # 109)
const purchaseStream = async (req, res) => {
  console.log('POST::purchaseStream');
  const packet = req.body;
  const { deviceId, userId, seed, healthData } = packet
  try {
    const buyingMsgs = getMessages(healthData ? 'Health Profile' : 'Device');
    if (!packet || !packet.userId || !packet.deviceId || !packet.seed) {
      console.error("purchaseStream failed. Packet: ", req.body, packet);
      await setMessageToFirebase(packet.userId, packet.deviceId, buyingMsgs.FIELDS_ABSENT, 3);
      return res.status(400).json({ error: "Malformed Request", packet });
    }

    const { firebaseEndPoint, provider, iotaApiVersion, defaultPrice, secretKey } = config;

    const alreadyBuyingDevice = (await axios.post(`${firebaseEndPoint}/isCurrentlyBuyingAny`, { userId })).data;
    console.log(alreadyBuyingDevice)
    if (alreadyBuyingDevice.data) {
      return res.json({ error: "You already have a purchase in progress. Please wait until it's completed" });
    }

    await setMessageToFirebase(userId, deviceId, buyingMsgs.STEP_1, 1);

    const device = (await axios.get(`${firebaseEndPoint}/device?deviceId=${deviceId}`)).data;
    let price = defaultPrice;
    if (device) {
      if ((device.buyers || []).includes(userId)) {
        await setMessageToFirebase(userId, deviceId, buyingMsgs.ALREADY_BOUGHT, 3);
        return res.status(403).json({ error: "Device already bought" });
      }
      if (device.price) {
        price = Number(device.price);
      } else if (device.value) {
        price = Number(device.value);
      }
    } else {
      await setMessageToFirebase(userId, deviceId, buyingMsgs.NOT_EXIST, 3);
      return res.status(404).json({ error: `Device doesn't exist` });
    }
    await setMessageToFirebase(userId, deviceId, buyingMsgs.STEP_2, 1);

    const { getBalances, sendTrytes, getLatestInclusion, getNewAddress, prepareTransfers } = composeAPI({ provider });

    // Balance validation code, open for production, commented for development
    // const allAddresses = await getNewAddress(packet.seed, { returnAll: true });
    // const { balances } = await getBalances(allAddresses, 10);
    // const totalBalance = balances.reduce((el, sum) => sum + el, 0);
    // if (price > totalBalance) {
    //   await setMessageToFirebase(userId, deviceId, buyingMsgs.INSUFFICIENT_BALANCE, 3);
    //   return res.status(404).json({ error: `Insufficient balanc, ${totalBalance}` });
    // }
    await setMessageToFirebase(userId, deviceId, buyingMsgs.STEP_3, 1);

    const security = 2;

    // Depth or how far to go for tip selection entry point
    const depth = 5

    // Difficulty of Proof-of-Work required to attach transaction to tangle.
    // Minimum value on mainnet & spamnet is `14`, `9` on devnet and other testnets.
    const minWeightMagnitude = 9

    const transfers = [{ address: device.address, value: 0 }];
    const trytes = await prepareTransfers(seed, transfers);
    await setMessageToFirebase(userId, deviceId, buyingMsgs.STEP_4, 1);
    const transactions = await sendTrytes(trytes, depth, minWeightMagnitude);
    await setMessageToFirebase(userId, deviceId, buyingMsgs.STEP_5, 1);
    const hashes = transactions.map(transaction => transaction.hash);

    let retries = 0;
    while (retries++ < 20) {
      if (retries === 1) {
        await setMessageToFirebase(userId, deviceId, buyingMsgs.WAITING_MSG, 1);
      } else if (retries === 17) {
        await setMessageToFirebase(userId, deviceId, buyingMsgs.ALMOST_THERE_MSG, 1);
      }
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
        await setMessageToFirebase(userId, deviceId, buyingMsgs.INVALID_TX, 3);
        return res.status(403).json({ error: "Transaction is Invalid" });
      }
      await setMessageToFirebase(userId, deviceId, buyingMsgs.STEP_6, 1);

      const payload = {
        userId,
        deviceId,
        secretKey
      };
      // await axios.post(`${firebaseEndPoint}/boughtDevice`, payload)
      console.log('DONE');
      await setMessageToFirebase(userId, deviceId, buyingMsgs.STEP_7, 2);
      return res.json({ success: true });
    }
    await setMessageToFirebase(userId, deviceId, buyingMsgs.LAST_ERROR, 3);
    return res.status(403).json({
      error: "Purchase failed. Insufficient balance of out of sync"
    });

  } catch (e) {
    console.error("purchaseData failed. Error: ", e);
    let errorMessage = e.message;
    if (e.response && e.response.data && e.response.data.error) {
      errorMessage = e.response.data.error;
    }
    await setMessageToFirebase(userId, deviceId, errorMessage, 3);
    return res.status(403).json({ error: errorMessage });
  }
}

const setMessageToFirebase = async (userId, deviceId, message, status) => {
  const { firebaseEndPoint } = config;
  const payload = {
    userId, deviceId, message, status
  };
  try {
    await axios.post(`${firebaseEndPoint}/setMessage`, payload);
    if (status === 2 || status === 3) {
      setTimeout(() => {
        deleteMessageFromFirebase(userId, deviceId);
      }, 2000);
    }
  }
  catch (e) {
    console.log(e.message);
  }
}

const deleteMessageFromFirebase = async (userId, deviceId) => {
  const { firebaseEndPoint } = config;
  const payload = {
    userId, deviceId
  };
  try {
    await axios.post(`${firebaseEndPoint}/deleteMessage`, payload);
  }
  catch (e) {
    console.log(e.message);
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

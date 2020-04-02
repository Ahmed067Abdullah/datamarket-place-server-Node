const express = require("express");
const iotaController = require("../controllers/iota");
const DelayedResponse = require('http-delayed-response');

const router = express.Router();

router.use(function (req, res, next) {
  // Only extend the timeout for purchaseStream
  if (!req.url.includes('/purchaseStream')) {
    next();
    return;
  }
  var delayed = new DelayedResponse(req, res);
  delayed.wait();
  var promise = iotaController.purchaseStream(req, res);
  // will eventually end when the promise is fulfilled
  delayed.end(promise);
});

router.get("/", iotaController.get);

// router.post("/purchaseStream", iotaController.purchaseStream);


module.exports = router;
